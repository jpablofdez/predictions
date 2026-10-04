import type {
  DrawPeriod,
  HistoricalRow,
  MonteCarloParams,
  PredictionEngine,
  PredictionEngineResult,
  PredictionInput,
  PredictionRow,
  RevFlag,
} from "../types";
import { type EnvironmentalFactors, getCalculableFactors, getEnvironmentalFactors } from "../environment/factors";

export const ENVIRONMENTAL_MODEL = "Environmental Monte Carlo";

const PERIOD_ORDER: Record<DrawPeriod, number> = {
  MEDIODIA: 0,
  TARDE: 1,
  NOCHE: 2,
};

// ── Hyperparameter sets (same structure as Monte Carlo, extended) ─────────

const PARAM_SETS: MonteCarloParams[] = [
  {
    name: "env-balanced",
    histDecay: 24,
    transDecay: 12,
    periodFreqW: 0.85,
    globalFreqW: 0.45,
    periodTransW: 1.0,
    globalTransW: 0.45,
    gapW: 0.3,
    momentumW: 0.15,
    temperature: 0.9,
  },
  {
    name: "env-lunar",
    histDecay: 30,
    transDecay: 15,
    periodFreqW: 0.7,
    globalFreqW: 0.5,
    periodTransW: 0.9,
    globalTransW: 0.5,
    gapW: 0.35,
    momentumW: 0.12,
    temperature: 0.95,
  },
  {
    name: "env-weather",
    histDecay: 20,
    transDecay: 10,
    periodFreqW: 0.9,
    globalFreqW: 0.4,
    periodTransW: 1.1,
    globalTransW: 0.4,
    gapW: 0.25,
    momentumW: 0.18,
    temperature: 0.88,
  },
];

// ── Environmental weights for digit scoring ──────────────────────────────────

type EnvWeights = {
  moonPhaseW: number;
  tidalW: number;
  solarW: number;
  geomagW: number;
  dayOfWeekW: number;
  seasonW: number;
  weatherW: number;
};

const ENV_WEIGHTS: EnvWeights = {
  moonPhaseW: 0.6,
  tidalW: 0.4,
  solarW: 0.25,
  geomagW: 0.3,
  dayOfWeekW: 0.5,
  seasonW: 0.35,
  weatherW: 0.45,
};

// ── Core math utilities ──────────────────────────────────────────────────────

function softmax(scores: number[], temperature: number): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 10 - d);
}

function sortHistory(history: HistoricalRow[]): HistoricalRow[] {
  return [...history].sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
    return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
  });
}

// ── Statistical core (frequency, transitions, gaps, momentum) ────────────

type DigitExtractor = (row: HistoricalRow) => number;

function buildDigitSeries(history: HistoricalRow[], period: DrawPeriod, extractor: DigitExtractor) {
  const samePeriod: number[] = [];
  const global: number[] = [];
  for (const row of history) {
    const digit = extractor(row);
    global.push(digit);
    if (row.period === period) samePeriod.push(digit);
  }
  return { samePeriod, global };
}

function weightedHistogram(values: number[], decay: number): number[] {
  const hist = Array.from({ length: 10 }, () => 0.1);
  for (let i = 0; i < values.length; i++) {
    const age = values.length - i - 1;
    hist[values[i]] += Math.exp(-age / decay);
  }
  return hist;
}

function weightedTransition(values: number[], decay: number): number[][] {
  const mat = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0.05));
  for (let i = 1; i < values.length; i++) {
    const age = values.length - i - 1;
    mat[values[i - 1]][values[i]] += Math.exp(-age / decay);
  }
  return mat;
}

function digitGap(values: number[]): number[] {
  const gaps = Array.from({ length: 10 }, () => values.length);
  for (let i = values.length - 1; i >= 0; i--) {
    const gap = values.length - 1 - i;
    if (gap < gaps[values[i]]) gaps[values[i]] = gap;
  }
  return gaps;
}

function digitMomentum(values: number[]): number[] {
  const momentum = Array.from({ length: 10 }, () => 0);
  for (let d = 0; d < 10; d++) {
    const idxs: number[] = [];
    for (let i = values.length - 1; i >= 0 && idxs.length < 5; i--) {
      if (values[i] === d) idxs.unshift(i);
    }
    if (idxs.length < 3) continue;
    let trend = 0;
    for (let i = 2; i < idxs.length; i++) {
      trend += (idxs[i - 1] - idxs[i - 2]) - (idxs[i] - idxs[i - 1]);
    }
    momentum[d] = trend / (idxs.length - 2);
  }
  return momentum;
}

// ── Environmental digit modulation ───────────────────────────────────────────
// Maps environmental factors to digit-level scoring adjustments

function moonDigitScore(digit: number, env: EnvironmentalFactors): number {
  // Moon phase maps to digit affinities via the lunar cycle
  // New moon (0): favors low digits (0-3), Full moon (0.5): favors high digits (6-9)
  const phaseAngle = env.moonPhase * 2 * Math.PI;
  const moonDigit = Math.round(env.moonPhase * 10) % 10;

  let score = 0;
  if (digit === moonDigit) score += 1.5;
  if (circularDistance(digit, moonDigit) <= 1) score += 0.6;

  // Illumination intensity modulates confidence
  score *= 0.7 + env.moonIllumination * 0.6;

  // Tidal force: high tides favor extreme digits (0, 9), low tides favor middle (4, 5)
  const isExtreme = digit === 0 || digit === 9;
  const isMiddle = digit === 4 || digit === 5;
  if (env.tidalForce > 0.7 && isExtreme) score += 0.5;
  if (env.tidalForce < 0.3 && isMiddle) score += 0.4;

  return score;
}

function solarGeomagDigitScore(digit: number, env: EnvironmentalFactors): number {
  let score = 0;

  // Solar cycle position modulates digit "energy"
  // Near solar max: more "energetic" (odd) digits favored
  // Near solar min: more "stable" (even) digits favored
  const isOdd = digit % 2 === 1;
  const solarEnergy = Math.sin(env.solarCyclePosition * Math.PI); // peaks at 0.5
  if (isOdd) score += solarEnergy * 0.5;
  else score += (1 - solarEnergy) * 0.4;

  // Geomagnetic activity: high activity increases variance (favors less common digits)
  // Modeled as slight boost to digits 1, 3, 7 (primes) during high activity
  const isPrime = [2, 3, 5, 7].includes(digit);
  if (env.geomagneticProxy > 0.5 && isPrime) score += 0.3;

  return score;
}

function calendarDigitScore(digit: number, env: EnvironmentalFactors): number {
  let score = 0;

  // Day of week pattern: each day has a "resonant" digit
  // Sun=0->1, Mon=1->2, Tue=2->3, Wed=3->4, Thu=4->5, Fri=5->6, Sat=6->7
  const resonantDigit = (env.dayOfWeek + 1) % 10;
  if (digit === resonantDigit) score += 0.8;
  if (circularDistance(digit, resonantDigit) === 1) score += 0.3;

  // Week of year cycle: creates a ~52-step modulation
  const weekDigit = env.weekOfYear % 10;
  if (digit === weekDigit) score += 0.4;

  // Season phase: dry season favors certain digit ranges, rainy season others
  // (purely experimental correlation mapping)
  const seasonAngle = env.seasonPhase * 2 * Math.PI;
  const seasonDigit = Math.round((Math.sin(seasonAngle) + 1) * 4.5) % 10;
  if (digit === seasonDigit) score += 0.35;

  // Draw hour influence
  const hourDigit = env.drawHour % 10;
  if (digit === hourDigit) score += 0.2;

  return score;
}

function weatherDigitScore(digit: number, env: EnvironmentalFactors): number {
  if (env.temperature === null) return 0;

  let score = 0;

  // Temperature mapping: hash temperature to digit space
  if (env.temperature !== null) {
    const tempDigit = Math.round(Math.abs(env.temperature)) % 10;
    if (digit === tempDigit) score += 0.5;
    if (circularDistance(digit, tempDigit) <= 2) score += 0.15;
  }

  // Humidity: high humidity (>80%) favors even digits, low humidity favors odd
  if (env.humidity !== null) {
    const humidityHigh = env.humidity > 80;
    const isEven = digit % 2 === 0;
    if (humidityHigh && isEven) score += 0.25;
    if (!humidityHigh && !isEven) score += 0.2;
  }

  // Pressure: map to digit via modular arithmetic
  if (env.pressure !== null) {
    const pressDigit = Math.round(env.pressure) % 10;
    if (digit === pressDigit) score += 0.4;
  }

  // Wind speed: higher wind = more "chaotic" = boost for digits that haven't appeared recently
  // (this is handled in combination with gap scoring, so just a mild directional bias)
  if (env.windSpeed !== null) {
    const windDigit = Math.round(env.windSpeed) % 10;
    if (digit === windDigit) score += 0.2;
  }

  // Precipitation: rain amounts create digit bias
  if (env.precipitation !== null && env.precipitation > 0) {
    const rainDigit = Math.round(env.precipitation * 10) % 10;
    if (digit === rainDigit) score += 0.3;
  }

  return score;
}

// ── Combined environmental score ─────────────────────────────────────────────

function environmentalDigitScore(digit: number, env: EnvironmentalFactors): number {
  const w = ENV_WEIGHTS;
  return (
    moonDigitScore(digit, env) * w.moonPhaseW +
    moonDigitScore(digit, env) * w.tidalW * 0.5 + // tidal is already part of moon score
    solarGeomagDigitScore(digit, env) * w.solarW +
    solarGeomagDigitScore(digit, env) * w.geomagW * 0.5 +
    calendarDigitScore(digit, env) * w.dayOfWeekW +
    calendarDigitScore(digit, env) * w.seasonW * 0.5 +
    weatherDigitScore(digit, env) * w.weatherW
  );
}

// ── Distribution for a digit channel ─────────────────────────────────────────

function distributionForChannel(
  history: HistoricalRow[],
  period: DrawPeriod,
  extractor: DigitExtractor,
  params: MonteCarloParams,
  env: EnvironmentalFactors,
): number[] {
  const { samePeriod, global } = buildDigitSeries(history, period, extractor);
  const pHist = weightedHistogram(samePeriod, params.histDecay);
  const gHist = weightedHistogram(global, params.histDecay * 1.4);
  const pTrans = weightedTransition(samePeriod, params.transDecay);
  const gTrans = weightedTransition(global, params.transDecay * 1.5);
  const pGaps = digitGap(samePeriod);
  const gGaps = digitGap(global);
  const pMom = digitMomentum(samePeriod);
  const gMom = digitMomentum(global);
  const lastP = samePeriod.length > 0 ? samePeriod[samePeriod.length - 1] : null;
  const lastG = global.length > 0 ? global[global.length - 1] : null;

  const scores: number[] = [];

  for (let d = 0; d < 10; d++) {
    const freqScore = pHist[d] * params.periodFreqW + gHist[d] * params.globalFreqW;

    const transScore =
      (lastP === null ? 0 : pTrans[lastP][d] * params.periodTransW) +
      (lastG === null ? 0 : gTrans[lastG][d] * params.globalTransW);

    const gapScore =
      (Math.log1p(pGaps[d]) + Math.log1p(gGaps[d])) * 0.5 * params.gapW;

    const momScore =
      (pMom[d] + gMom[d]) * 0.5 * params.momentumW;

    const proxScore = lastP === null ? 0 : (5 - circularDistance(d, lastP)) * 0.08;

    // Environmental modulation (the new component)
    const envScore = environmentalDigitScore(d, env);

    scores.push(freqScore + transScore + gapScore + momScore + proxScore + envScore);
  }

  return softmax(scores, params.temperature);
}

// ── Top prediction for a slot ────────────────────────────────────────────────

function topPrediction(
  history: HistoricalRow[],
  period: DrawPeriod,
  params: MonteCarloParams,
  env: EnvironmentalFactors,
) {
  const nTens = distributionForChannel(history, period, (r) => Math.floor(r.n / 10), params, env);
  const nOnes = distributionForChannel(history, period, (r) => r.n % 10, params, env);
  const mrTens = distributionForChannel(history, period, (r) => Math.floor(r.mr / 10), params, env);
  const mrOnes = distributionForChannel(history, period, (r) => r.mr % 10, params, env);

  let best = { n: 0, mr: 0, probability: -1 };

  for (let nt = 0; nt < 10; nt++) {
    for (let no = 0; no < 10; no++) {
      for (let mt = 0; mt < 10; mt++) {
        for (let mo = 0; mo < 10; mo++) {
          const p = nTens[nt] * nOnes[no] * mrTens[mt] * mrOnes[mo];
          if (p > best.probability) {
            best = { n: nt * 10 + no, mr: mt * 10 + mo, probability: p };
          }
        }
      }
    }
  }

  return best;
}

// ── Backtesting for param selection ──────────────────────────────────────────

function scoreParams(history: HistoricalRow[], params: MonteCarloParams): number {
  const holdout = Math.min(24, Math.floor(history.length * 0.18));
  if (holdout < 6) return Number.POSITIVE_INFINITY;

  let totalError = 0;

  for (let i = history.length - holdout; i < history.length; i++) {
    const train = history.slice(0, i);
    const slot = history[i];
    // Use calculable factors only for backtesting (no API calls)
    const env = getCalculableFactors(slot.dateISO, slot.period);
    const predicted = topPrediction(train, slot.period, params, env);

    const splitD = (v: number): [number, number] => [Math.floor(v / 10), v % 10];
    const [pNT, pNO] = splitD(predicted.n);
    const [pMT, pMO] = splitD(predicted.mr);
    const [aNT, aNO] = splitD(slot.n);
    const [aMT, aMO] = splitD(slot.mr);

    totalError +=
      circularDistance(pNT, aNT) +
      circularDistance(pNO, aNO) +
      circularDistance(pMT, aMT) +
      circularDistance(pMO, aMO);
  }

  return totalError / holdout;
}

function selectBestParams(history: HistoricalRow[]) {
  let best = { params: PARAM_SETS[0], score: Number.POSITIVE_INFINITY };
  for (const params of PARAM_SETS) {
    const score = scoreParams(history, params);
    if (score < best.score) best = { params, score };
  }
  return best;
}

// ── Rev prediction with environmental influence ──────────────────────────────

function revProbability(
  history: HistoricalRow[],
  period: DrawPeriod,
  n: number,
  mr: number,
  env: EnvironmentalFactors,
): number {
  const rows = history.filter((r) => r.period === period);
  const baseRate = rows.length === 0 ? 0.32 : rows.filter((r) => r.rev === "R").length / rows.length;

  // Digit-based boost
  const digitSum = (Math.floor(n / 10) + (n % 10) + Math.floor(mr / 10) + (mr % 10)) % 10;
  const digitBoost = digitSum === 5 ? 0.08 : digitSum === 9 ? 0.05 : 0;

  // Environmental boost: full moon and high tidal force increase Rev probability
  const moonBoost = env.moonIllumination > 0.8 ? 0.06 : env.moonIllumination < 0.2 ? -0.03 : 0;
  const tidalBoost = env.tidalForce > 0.8 ? 0.04 : 0;
  const geomagBoost = env.geomagneticProxy > 0.6 ? 0.03 : 0;

  return Math.min(0.9, Math.max(0.05, baseRate + digitBoost + moonBoost + tidalBoost + geomagBoost));
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function generateEnvironmentalRows(
  input: PredictionInput,
): Promise<{ rows: PredictionRow[]; selectedParams: MonteCarloParams; backtestMeanDigitError: number }> {
  const history = sortHistory(input.history);
  const { params: bestParams, score } = selectBestParams(history);
  const workingHistory = [...history];

  // Fetch environmental factors for all unique date+period combos
  // Use batched approach: fetch weather once per unique date
  const envCache = new Map<string, EnvironmentalFactors>();

  // Pre-fetch environment data for all slots (parallel by date)
  const uniqueDates = [...new Set(input.slots.map((s) => s.dateISO))];
  const periods: DrawPeriod[] = ["MEDIODIA", "TARDE", "NOCHE"];

  await Promise.all(
    uniqueDates.map(async (dateISO) => {
      for (const period of periods) {
        const key = `${dateISO}|${period}`;
        if (input.slots.some((s) => s.dateISO === dateISO && s.period === period)) {
          try {
            const factors = await getEnvironmentalFactors(dateISO, period);
            envCache.set(key, factors);
          } catch {
            // Fall back to calculable only
            envCache.set(key, getCalculableFactors(dateISO, period));
          }
        }
      }
    }),
  );

  const rows = input.slots.map((slot) => {
    const priorHistory = workingHistory.filter((row) => {
      if (row.dateISO !== slot.dateISO) return row.dateISO < slot.dateISO;
      return PERIOD_ORDER[row.period] < PERIOD_ORDER[slot.period];
    });

    const envKey = `${slot.dateISO}|${slot.period}`;
    const env = envCache.get(envKey) ?? getCalculableFactors(slot.dateISO, slot.period);

    const predicted = topPrediction(priorHistory, slot.period, bestParams, env);
    const revP = revProbability(priorHistory, slot.period, predicted.n, predicted.mr, env);
    const rev: RevFlag = revP >= 0.5 ? "R" : "-";

    const row: PredictionRow = {
      dateISO: slot.dateISO,
      weekdayEs: slot.weekdayEs,
      period: slot.period,
      n: predicted.n,
      rev,
      mr: predicted.mr,
      source: "fallback",
    };

    workingHistory.push({
      dateISO: row.dateISO,
      weekdayEs: row.weekdayEs,
      period: row.period,
      n: row.n,
      rev: row.rev,
      mr: row.mr,
    });
    workingHistory.sort((a, b) => {
      if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
      return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
    });

    return row;
  });

  return {
    rows,
    selectedParams: bestParams,
    backtestMeanDigitError: Number(score.toFixed(4)),
  };
}

export class EnvironmentalPredictionEngine implements PredictionEngine {
  async generate(input: PredictionInput): Promise<PredictionEngineResult> {
    const { rows } = await generateEnvironmentalRows(input);
    return { rows, model: ENVIRONMENTAL_MODEL };
  }
}

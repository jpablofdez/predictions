import type { DrawPeriod, PredictionEngine, PredictionEngineResult, PredictionInput, PredictionRow } from "../types";

export const BUBBLING_FLOWS_MODEL = "Bubbling flows fractal";

// ── Hyperparameter types & candidates ────────────────────────────────────────

export type FractalHyperparams = {
  histDecay: number;        // recency decay for histogram weights
  transDecay: number;       // recency decay for transition matrix weights
  freqPeriodW: number;      // period-specific frequency score weight
  freqGlobalW: number;      // global frequency score weight
  transPeriodW: number;     // period-specific transition score weight
  transGlobalW: number;     // global transition score weight
  fractalPeriodW: number;   // period fractal lag score weight
  fractalGlobalW: number;   // global fractal lag score weight
  proximityW: number;       // proximity-to-last-period-value weight
  lagProjectionW: number;   // linear-projection term weight in lag similarity
  jitterScale: number;      // noise scale
  gapW: number;             // gap pressure weight (air console: balls not picked recently)
  momentumW: number;        // momentum/streak detection weight
  temperature: number;      // softmax temperature for air console sampling
};

export const HYPERPARAMS_CANDIDATES: FractalHyperparams[] = [
  // Baseline (original hardcoded values)
  { histDecay: 55,  transDecay: 34, freqPeriodW: 1.15, freqGlobalW: 0.65, transPeriodW: 1.2,  transGlobalW: 0.55, fractalPeriodW: 1.45, fractalGlobalW: 0.58, proximityW: 1.12, lagProjectionW: 0.23, jitterScale: 0.02, gapW: 0.8,  momentumW: 0.5,  temperature: 1.5 },
  // Long memory
  { histDecay: 89,  transDecay: 55, freqPeriodW: 1.3,  freqGlobalW: 0.5,  transPeriodW: 1.4,  transGlobalW: 0.4,  fractalPeriodW: 1.6,  fractalGlobalW: 0.45, proximityW: 0.9,  lagProjectionW: 0.18, jitterScale: 0.01, gapW: 1.0,  momentumW: 0.3,  temperature: 1.2 },
  // Short memory (recent-biased)
  { histDecay: 21,  transDecay: 13, freqPeriodW: 1.0,  freqGlobalW: 0.8,  transPeriodW: 1.0,  transGlobalW: 0.7,  fractalPeriodW: 1.2,  fractalGlobalW: 0.7,  proximityW: 1.4,  lagProjectionW: 0.3,  jitterScale: 0.03, gapW: 0.6,  momentumW: 0.8,  temperature: 2.0 },
  // Balanced global
  { histDecay: 34,  transDecay: 21, freqPeriodW: 0.9,  freqGlobalW: 0.9,  transPeriodW: 0.9,  transGlobalW: 0.9,  fractalPeriodW: 1.1,  fractalGlobalW: 0.9,  proximityW: 1.0,  lagProjectionW: 0.25, jitterScale: 0.02, gapW: 0.7,  momentumW: 0.6,  temperature: 1.8 },
  // Fractal-dominant
  { histDecay: 55,  transDecay: 34, freqPeriodW: 0.8,  freqGlobalW: 0.4,  transPeriodW: 0.7,  transGlobalW: 0.3,  fractalPeriodW: 2.2,  fractalGlobalW: 1.0,  proximityW: 0.8,  lagProjectionW: 0.4,  jitterScale: 0.01, gapW: 0.5,  momentumW: 0.4,  temperature: 1.0 },
];

const HOLDOUT_SIZE = 30; // entries reserved for hyperparameter evaluation

// ── Internal types ─────────────────────────────────────────────────────────

type DigitChannel = "nTens" | "nOnes" | "mrTens" | "mrOnes";
type ChannelSeries = Record<DigitChannel, number[]>;
type ChannelModel = {
  values: number[];
  histogram: number[];
  transition: number[][];
  gaps: number[];       // gaps[d] = draws since digit d last appeared
  momentum: number[];   // momentum[d] = trend direction score for digit d
  last: number | null;
  prev: number | null;
};
type ChannelModelSet = Record<DigitChannel, ChannelModel>;
type LastByPeriod = Record<DrawPeriod, { n: number; mr: number } | null>;

const PERIOD_ORDER: Record<DrawPeriod, number> = {
  MEDIODIA: 0,
  TARDE: 1,
  NOCHE: 2,
};

const FRACTAL_LAGS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;

// ── Deterministic RNG ───────────────────────────────────────────────────────

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function bubbleDigit(seed: number, stream: number): number {
  const mixed = seed ^ Math.imul(stream + 1, 0x9e3779b1);
  return nextSeed(mixed >>> 0) % 10;
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function positiveMod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function circularDigitDistance(a: number, b: number): number {
  const delta = Math.abs(a - b);
  return Math.min(delta, 10 - delta);
}

function splitDigits(value: number): [number, number] {
  return [Math.floor(value / 10), value % 10];
}

function combineDigits(tens: number, ones: number): number {
  return tens * 10 + ones;
}

// ── History helpers ──────────────────────────────────────────────────────────

function sortedHistory(history: PredictionInput["history"]): PredictionInput["history"] {
  return [...history].sort((a, b) => {
    if (a.dateISO !== b.dateISO) {
      return a.dateISO.localeCompare(b.dateISO);
    }
    return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
  });
}

function createChannelSeries(): ChannelSeries {
  return { nTens: [], nOnes: [], mrTens: [], mrOnes: [] };
}

function pushRowChannels(series: ChannelSeries, n: number, mr: number): void {
  const [nTens, nOnes] = splitDigits(n);
  const [mrTens, mrOnes] = splitDigits(mr);
  series.nTens.push(nTens);
  series.nOnes.push(nOnes);
  series.mrTens.push(mrTens);
  series.mrOnes.push(mrOnes);
}

// ── Channel model builders (param-driven) ────────────────────────────────────

function buildChannelModel(values: number[], histDecay: number, transDecay: number): ChannelModel {
  const histogram = Array.from({ length: 10 }, () => 0.25);
  const transition = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0.05));
  const total = values.length;

  for (let i = 0; i < total; i += 1) {
    const age = total - i - 1;
    histogram[values[i]] += Math.exp(-age / histDecay);
  }

  for (let i = 1; i < total; i += 1) {
    const age = total - i - 1;
    transition[values[i - 1]][values[i]] += Math.exp(-age / transDecay);
  }

  // Gap analysis: how many draws since each digit last appeared
  const gaps = Array.from({ length: 10 }, () => total); // default: never appeared
  for (let i = total - 1; i >= 0; i -= 1) {
    const d = values[i];
    const gap = total - 1 - i;
    if (gap < gaps[d]) {
      gaps[d] = gap;
    }
  }

  // Momentum: trend detection from last 5 appearances of each digit
  const MOMENTUM_WINDOW = 5;
  const momentum = Array.from({ length: 10 }, () => 0);
  for (let d = 0; d < 10; d += 1) {
    const appearances: number[] = [];
    for (let i = total - 1; i >= 0 && appearances.length < MOMENTUM_WINDOW; i -= 1) {
      if (values[i] === d) {
        appearances.unshift(i); // store indices in chronological order
      }
    }
    if (appearances.length >= 2) {
      // Compute average spacing trend: decreasing gaps = positive momentum (appearing more often)
      let trendSum = 0;
      for (let j = 1; j < appearances.length; j += 1) {
        const prevGap = j >= 2 ? appearances[j - 1] - appearances[j - 2] : appearances[j] - appearances[j - 1];
        const currGap = appearances[j] - appearances[j - 1];
        trendSum += prevGap - currGap; // positive if gaps are shrinking
      }
      momentum[d] = trendSum / (appearances.length - 1);
    }
  }

  return {
    values,
    histogram,
    transition,
    gaps,
    momentum,
    last: total > 0 ? values[total - 1] : null,
    prev: total > 1 ? values[total - 2] : null,
  };
}

function buildModelSet(series: ChannelSeries, hp: FractalHyperparams): ChannelModelSet {
  return {
    nTens: buildChannelModel(series.nTens, hp.histDecay, hp.transDecay),
    nOnes: buildChannelModel(series.nOnes, hp.histDecay, hp.transDecay),
    mrTens: buildChannelModel(series.mrTens, hp.histDecay, hp.transDecay),
    mrOnes: buildChannelModel(series.mrOnes, hp.histDecay, hp.transDecay),
  };
}

// ── Rev rate ────────────────────────────────────────────────────────────────

function computeRevRate(history: PredictionInput["history"]): Record<DrawPeriod, number> {
  const rates: Record<DrawPeriod, number> = { MEDIODIA: 0.3, TARDE: 0.3, NOCHE: 0.3 };

  for (const period of Object.keys(rates) as DrawPeriod[]) {
    const rows = history.filter((row) => row.period === period);
    if (rows.length === 0) continue;
    rates[period] = rows.filter((row) => row.rev === "R").length / rows.length;
  }

  return rates;
}

// ── Fractal scoring ──────────────────────────────────────────────────────────

function lagSimilarity(values: number[], candidate: number, lagProjectionW: number): number {
  if (values.length === 0) return 0;

  let score = 0;

  for (const lag of FRACTAL_LAGS) {
    if (values.length <= lag) continue;
    const anchor = values[values.length - lag];
    const closeness = 1 - circularDigitDistance(candidate, anchor) / 5;
    score += Math.max(0, closeness) / Math.sqrt(lag);
  }

  if (values.length >= 2) {
    const last = values[values.length - 1];
    const prev = values[values.length - 2];
    const projected = positiveMod(last + (last - prev), 10);
    score += (10 - circularDigitDistance(candidate, projected)) * lagProjectionW;
  }

  return score;
}

function pickFractalDigit(params: {
  periodModel: ChannelModel;
  globalModel: ChannelModel;
  preferredDigit: number | null;
  seed: number;
  hp: FractalHyperparams;
}): number {
  const { periodModel, globalModel, preferredDigit, seed, hp } = params;

  const scores: number[] = [];

  for (let digit = 0; digit < 10; digit += 1) {
    const freqScore =
      periodModel.histogram[digit] * hp.freqPeriodW +
      globalModel.histogram[digit] * hp.freqGlobalW;

    const periodTransition =
      periodModel.last === null
        ? 0
        : periodModel.transition[periodModel.last][digit] * hp.transPeriodW;

    const globalTransition =
      globalModel.last === null
        ? 0
        : globalModel.transition[globalModel.last][digit] * hp.transGlobalW;

    const fractalScore =
      lagSimilarity(periodModel.values, digit, hp.lagProjectionW) * hp.fractalPeriodW +
      lagSimilarity(globalModel.values, digit, hp.lagProjectionW) * hp.fractalGlobalW;

    const proximityScore =
      preferredDigit === null
        ? 0
        : (10 - circularDigitDistance(digit, preferredDigit)) * hp.proximityW;

    const jitter = (bubbleDigit(seed, digit) - 4.5) * hp.jitterScale;

    // Gap pressure: digits absent longer get higher pressure (like an unpicked ball)
    const gapScore =
      (Math.log1p(periodModel.gaps[digit]) + Math.log1p(globalModel.gaps[digit])) * 0.5 * hp.gapW;

    // Momentum: digits trending toward more frequent appearances score higher
    const momentumScore =
      (periodModel.momentum[digit] + globalModel.momentum[digit]) * 0.5 * hp.momentumW;

    const score = freqScore + periodTransition + globalTransition + fractalScore + proximityScore + jitter + gapScore + momentumScore;
    scores.push(score);
  }

  // Air console simulation: softmax converts scores to probabilities
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxScore) / hp.temperature));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);

  // Weighted sampling using seeded RNG (deterministic)
  const samplerSeed = nextSeed(seed ^ 0x3c6ef372);
  const roll = (samplerSeed >>> 0) / 0x100000000; // uniform [0, 1)
  let cumulative = 0;
  for (let digit = 0; digit < 10; digit += 1) {
    cumulative += probs[digit];
    if (roll < cumulative) {
      return digit;
    }
  }

  return 9; // fallback for floating-point edge case
}

// ── Context builder ──────────────────────────────────────────────────────────

function buildContext(
  history: PredictionInput["history"],
  hp: FractalHyperparams,
): {
  byPeriod: Record<DrawPeriod, ChannelModelSet>;
  global: ChannelModelSet;
  lastByPeriod: LastByPeriod;
  revRateByPeriod: Record<DrawPeriod, number>;
} {
  const ordered = sortedHistory(history);
  const byPeriodSeries: Record<DrawPeriod, ChannelSeries> = {
    MEDIODIA: createChannelSeries(),
    TARDE: createChannelSeries(),
    NOCHE: createChannelSeries(),
  };
  const globalSeries = createChannelSeries();
  const lastByPeriod: LastByPeriod = { MEDIODIA: null, TARDE: null, NOCHE: null };

  for (const row of ordered) {
    pushRowChannels(byPeriodSeries[row.period], row.n, row.mr);
    pushRowChannels(globalSeries, row.n, row.mr);
    lastByPeriod[row.period] = { n: row.n, mr: row.mr };
  }

  return {
    byPeriod: {
      MEDIODIA: buildModelSet(byPeriodSeries.MEDIODIA, hp),
      TARDE: buildModelSet(byPeriodSeries.TARDE, hp),
      NOCHE: buildModelSet(byPeriodSeries.NOCHE, hp),
    },
    global: buildModelSet(globalSeries, hp),
    lastByPeriod,
    revRateByPeriod: computeRevRate(ordered),
  };
}

// ── Field predictor ──────────────────────────────────────────────────────────

function slotSeed(historyFingerprint: string, slot: { dateISO: string; period: DrawPeriod }): number {
  return hashSeed(`fractal:${historyFingerprint}:${slot.dateISO}:${slot.period}`);
}

function predictFieldNumber(params: {
  periodModels: ChannelModelSet;
  globalModels: ChannelModelSet;
  field: "n" | "mr";
  preferredValue: number;
  seed: number;
  hp: FractalHyperparams;
}): number {
  const { field, preferredValue, seed, hp } = params;
  const [preferredTens, preferredOnes] = splitDigits(preferredValue);
  const tensChannel = field === "n" ? "nTens" : "mrTens";
  const onesChannel = field === "n" ? "nOnes" : "mrOnes";

  const tens = pickFractalDigit({
    periodModel: params.periodModels[tensChannel],
    globalModel: params.globalModels[tensChannel],
    preferredDigit: preferredTens,
    seed: seed ^ 0x85ebca6b,
    hp,
  });
  const ones = pickFractalDigit({
    periodModel: params.periodModels[onesChannel],
    globalModel: params.globalModels[onesChannel],
    preferredDigit: preferredOnes,
    seed: seed ^ 0xc2b2ae35,
    hp,
  });

  return combineDigits(tens, ones);
}

// ── Hyperparameter selection ─────────────────────────────────────────────────

function scoreParams(hp: FractalHyperparams, ordered: PredictionInput["history"]): number {
  if (ordered.length <= HOLDOUT_SIZE) {
    return Infinity;
  }

  const train = ordered.slice(0, -HOLDOUT_SIZE);
  const test = ordered.slice(-HOLDOUT_SIZE);
  const context = buildContext(train, hp);
  const fingerprint = train
    .map((r) => `${r.dateISO}|${r.period}|${r.n}|${r.rev}|${r.mr}`)
    .join(";");

  let totalError = 0;

  for (const entry of test) {
    const seed = slotSeed(fingerprint, entry);
    const lastPeriod = context.lastByPeriod[entry.period];

    const n = predictFieldNumber({
      periodModels: context.byPeriod[entry.period],
      globalModels: context.global,
      field: "n",
      preferredValue: lastPeriod?.n ?? 11,
      seed: seed ^ 0x27d4eb2f,
      hp,
    });
    const mr = predictFieldNumber({
      periodModels: context.byPeriod[entry.period],
      globalModels: context.global,
      field: "mr",
      preferredValue: lastPeriod?.mr ?? 77,
      seed: seed ^ 0x165667b1,
      hp,
    });

    const [nT, nO] = splitDigits(n);
    const [mrT, mrO] = splitDigits(mr);
    const [aNT, aNO] = splitDigits(entry.n);
    const [aMrT, aMrO] = splitDigits(entry.mr);

    totalError +=
      circularDigitDistance(nT, aNT) +
      circularDigitDistance(nO, aNO) +
      circularDigitDistance(mrT, aMrT) +
      circularDigitDistance(mrO, aMrO);
  }

  return totalError / HOLDOUT_SIZE;
}

function selectBestHyperparams(history: PredictionInput["history"]): {
  hp: FractalHyperparams;
  adaptive: boolean;
} {
  const ordered = sortedHistory(history);
  if (ordered.length <= HOLDOUT_SIZE) {
    return { hp: HYPERPARAMS_CANDIDATES[0], adaptive: false };
  }

  let bestHp = HYPERPARAMS_CANDIDATES[0];
  let bestScore = Infinity;

  for (const candidate of HYPERPARAMS_CANDIDATES) {
    const score = scoreParams(candidate, ordered);
    if (score < bestScore) {
      bestScore = score;
      bestHp = candidate;
    }
  }

  return { hp: bestHp, adaptive: true };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generateFallbackRows(
  input: PredictionInput,
  hp: FractalHyperparams = HYPERPARAMS_CANDIDATES[0],
): PredictionRow[] {
  const orderedHistory = sortedHistory(input.history);
  const historyFingerprint = orderedHistory
    .map((row) => `${row.dateISO}|${row.period}|${row.n}|${row.rev}|${row.mr}`)
    .join(";");
  const context = buildContext(orderedHistory, hp);

  return input.slots.map((slot) => {
    const seed = slotSeed(historyFingerprint, slot);
    const lastPeriod = context.lastByPeriod[slot.period];
    const preferredN = lastPeriod?.n ?? 11;
    const preferredMr = lastPeriod?.mr ?? 77;

    const n = predictFieldNumber({
      periodModels: context.byPeriod[slot.period],
      globalModels: context.global,
      field: "n",
      preferredValue: preferredN,
      seed: seed ^ 0x27d4eb2f,
      hp,
    });
    const mr = predictFieldNumber({
      periodModels: context.byPeriod[slot.period],
      globalModels: context.global,
      field: "mr",
      preferredValue: preferredMr,
      seed: seed ^ 0x165667b1,
      hp,
    });

    const revThreshold = Math.round(context.revRateByPeriod[slot.period] * 100);
    const revSignal = positiveMod(
      n + mr + bubbleDigit(seed, 20) * 7 + bubbleDigit(seed, 21) * 3 + PERIOD_ORDER[slot.period] * 11,
      100,
    );
    const rev = revSignal < revThreshold ? "R" : "-";

    return {
      dateISO: slot.dateISO,
      weekdayEs: slot.weekdayEs,
      period: slot.period,
      n,
      rev,
      mr,
      source: "fallback",
    };
  });
}

export class FallbackPredictionEngine implements PredictionEngine {
  async generate(input: PredictionInput): Promise<PredictionEngineResult> {
    const { hp, adaptive } = selectBestHyperparams(input.history);
    const rows = generateFallbackRows(input, hp);
    const model = adaptive ? `${BUBBLING_FLOWS_MODEL} (adaptive)` : BUBBLING_FLOWS_MODEL;
    return { rows, model };
  }
}

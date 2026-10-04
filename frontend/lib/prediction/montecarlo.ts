import type {
  CandidatePrediction,
  CandidateResponse,
  CandidateSlotRequest,
  DrawPeriod,
  HistoricalRow,
  MonteCarloParams,
  PredictionEngine,
  PredictionEngineResult,
  PredictionInput,
  PredictionRow,
  RevFlag,
} from "../types";

export const MONTE_CARLO_MODEL = "Adaptive Monte Carlo digit-channel";

const PERIOD_ORDER: Record<DrawPeriod, number> = {
  MEDIODIA: 0,
  TARDE: 1,
  NOCHE: 2,
};

const PARAM_SETS: MonteCarloParams[] = [
  {
    name: "balanced",
    histDecay: 24,
    transDecay: 12,
    periodFreqW: 0.9,
    globalFreqW: 0.5,
    periodTransW: 1.1,
    globalTransW: 0.5,
    gapW: 0.35,
    momentumW: 0.15,
    temperature: 0.92,
  },
  {
    name: "recent",
    histDecay: 14,
    transDecay: 7,
    periodFreqW: 1.05,
    globalFreqW: 0.35,
    periodTransW: 1.3,
    globalTransW: 0.35,
    gapW: 0.25,
    momentumW: 0.2,
    temperature: 0.88,
  },
  {
    name: "long",
    histDecay: 40,
    transDecay: 18,
    periodFreqW: 0.8,
    globalFreqW: 0.65,
    periodTransW: 0.95,
    globalTransW: 0.65,
    gapW: 0.45,
    momentumW: 0.12,
    temperature: 1,
  },
  {
    name: "transition",
    histDecay: 20,
    transDecay: 8,
    periodFreqW: 0.7,
    globalFreqW: 0.35,
    periodTransW: 1.45,
    globalTransW: 0.6,
    gapW: 0.28,
    momentumW: 0.18,
    temperature: 0.84,
  },
  {
    name: "gap",
    histDecay: 28,
    transDecay: 14,
    periodFreqW: 0.78,
    globalFreqW: 0.45,
    periodTransW: 1,
    globalTransW: 0.45,
    gapW: 0.6,
    momentumW: 0.1,
    temperature: 0.95,
  },
];

type DigitExtractor = (row: HistoricalRow) => number;

function splitDigits(value: number): [number, number] {
  return [Math.floor(value / 10), value % 10];
}

function circularDistance(a: number, b: number): number {
  const delta = Math.abs(a - b);
  return Math.min(delta, 10 - delta);
}

function softmax(scores: number[], temperature: number): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp((score - max) / temperature));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function sortHistory(history: HistoricalRow[]): HistoricalRow[] {
  return [...history].sort((a, b) => {
    if (a.dateISO !== b.dateISO) {
      return a.dateISO.localeCompare(b.dateISO);
    }

    return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
  });
}

function buildDigitSeries(history: HistoricalRow[], period: DrawPeriod, extractor: DigitExtractor) {
  const samePeriod: number[] = [];
  const global: number[] = [];

  for (const row of history) {
    const digit = extractor(row);
    global.push(digit);
    if (row.period === period) {
      samePeriod.push(digit);
    }
  }

  return { samePeriod, global };
}

function weightedHistogram(values: number[], decay: number): number[] {
  const histogram = Array.from({ length: 10 }, () => 0.1);
  const total = values.length;

  for (let index = 0; index < total; index += 1) {
    const age = total - index - 1;
    histogram[values[index]] += Math.exp(-age / decay);
  }

  return histogram;
}

function weightedTransition(values: number[], decay: number): number[][] {
  const matrix = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0.05));
  const total = values.length;

  for (let index = 1; index < total; index += 1) {
    const age = total - index - 1;
    matrix[values[index - 1]][values[index]] += Math.exp(-age / decay);
  }

  return matrix;
}

function digitGap(values: number[]): number[] {
  const total = values.length;
  const gaps = Array.from({ length: 10 }, () => total);

  for (let index = total - 1; index >= 0; index -= 1) {
    const digit = values[index];
    const gap = total - 1 - index;
    if (gap < gaps[digit]) {
      gaps[digit] = gap;
    }
  }

  return gaps;
}

function digitMomentum(values: number[]): number[] {
  const momentum = Array.from({ length: 10 }, () => 0);

  for (let digit = 0; digit < 10; digit += 1) {
    const indexes: number[] = [];
    for (let index = values.length - 1; index >= 0 && indexes.length < 5; index -= 1) {
      if (values[index] === digit) {
        indexes.unshift(index);
      }
    }

    if (indexes.length < 3) {
      continue;
    }

    let trend = 0;
    for (let index = 2; index < indexes.length; index += 1) {
      const prevGap = indexes[index - 1] - indexes[index - 2];
      const nextGap = indexes[index] - indexes[index - 1];
      trend += prevGap - nextGap;
    }
    momentum[digit] = trend / (indexes.length - 2);
  }

  return momentum;
}

function distributionForChannel(
  history: HistoricalRow[],
  period: DrawPeriod,
  extractor: DigitExtractor,
  params: MonteCarloParams,
): number[] {
  const { samePeriod, global } = buildDigitSeries(history, period, extractor);
  const periodHistogram = weightedHistogram(samePeriod, params.histDecay);
  const globalHistogram = weightedHistogram(global, params.histDecay * 1.4);
  const periodTransition = weightedTransition(samePeriod, params.transDecay);
  const globalTransition = weightedTransition(global, params.transDecay * 1.5);
  const periodGaps = digitGap(samePeriod);
  const globalGaps = digitGap(global);
  const periodMomentum = digitMomentum(samePeriod);
  const globalMomentum = digitMomentum(global);
  const lastPeriod = samePeriod.length > 0 ? samePeriod[samePeriod.length - 1] : null;
  const lastGlobal = global.length > 0 ? global[global.length - 1] : null;

  const scores: number[] = [];

  for (let digit = 0; digit < 10; digit += 1) {
    const frequencyScore =
      periodHistogram[digit] * params.periodFreqW +
      globalHistogram[digit] * params.globalFreqW;

    const transitionScore =
      (lastPeriod === null ? 0 : periodTransition[lastPeriod][digit] * params.periodTransW) +
      (lastGlobal === null ? 0 : globalTransition[lastGlobal][digit] * params.globalTransW);

    const gapScore =
      (Math.log1p(periodGaps[digit]) + Math.log1p(globalGaps[digit])) * 0.5 * params.gapW;

    const momentumScore =
      (periodMomentum[digit] + globalMomentum[digit]) * 0.5 * params.momentumW;

    const proximityScore = lastPeriod === null ? 0 : (5 - circularDistance(digit, lastPeriod)) * 0.08;

    scores.push(frequencyScore + transitionScore + gapScore + momentumScore + proximityScore);
  }

  return softmax(scores, params.temperature);
}

function topPrediction(history: HistoricalRow[], slot: CandidateSlotRequest, params: MonteCarloParams) {
  const nTens = distributionForChannel(history, slot.period, (row) => Math.floor(row.n / 10), params);
  const nOnes = distributionForChannel(history, slot.period, (row) => row.n % 10, params);
  const mrTens = distributionForChannel(history, slot.period, (row) => Math.floor(row.mr / 10), params);
  const mrOnes = distributionForChannel(history, slot.period, (row) => row.mr % 10, params);

  let best = { n: 0, mr: 0, probability: -1 };

  for (let nTensDigit = 0; nTensDigit < 10; nTensDigit += 1) {
    for (let nOnesDigit = 0; nOnesDigit < 10; nOnesDigit += 1) {
      for (let mrTensDigit = 0; mrTensDigit < 10; mrTensDigit += 1) {
        for (let mrOnesDigit = 0; mrOnesDigit < 10; mrOnesDigit += 1) {
          const probability =
            nTens[nTensDigit] *
            nOnes[nOnesDigit] *
            mrTens[mrTensDigit] *
            mrOnes[mrOnesDigit];

          if (probability > best.probability) {
            best = {
              n: nTensDigit * 10 + nOnesDigit,
              mr: mrTensDigit * 10 + mrOnesDigit,
              probability,
            };
          }
        }
      }
    }
  }

  return best;
}

function scoreParams(history: HistoricalRow[], params: MonteCarloParams): number {
  const holdout = Math.min(24, Math.floor(history.length * 0.18));
  if (holdout < 6) {
    return Number.POSITIVE_INFINITY;
  }

  let totalError = 0;

  for (let index = history.length - holdout; index < history.length; index += 1) {
    const train = history.slice(0, index);
    const slot = history[index];
    const predicted = topPrediction(train, slot, params);
    const [predictedNTens, predictedNOnes] = splitDigits(predicted.n);
    const [predictedMRTens, predictedMROnes] = splitDigits(predicted.mr);
    const [actualNTens, actualNOnes] = splitDigits(slot.n);
    const [actualMRTens, actualMROnes] = splitDigits(slot.mr);

    totalError +=
      circularDistance(predictedNTens, actualNTens) +
      circularDistance(predictedNOnes, actualNOnes) +
      circularDistance(predictedMRTens, actualMRTens) +
      circularDistance(predictedMROnes, actualMROnes);
  }

  return totalError / holdout;
}

function selectBestParams(history: HistoricalRow[]) {
  let best = { params: PARAM_SETS[0], score: Number.POSITIVE_INFINITY };

  for (const params of PARAM_SETS) {
    const score = scoreParams(history, params);
    if (score < best.score) {
      best = { params, score };
    }
  }

  return best;
}

function revProbability(history: HistoricalRow[], period: DrawPeriod, n: number, mr: number): number {
  const rows = history.filter((row) => row.period === period);
  const baseRate = rows.length === 0 ? 0.32 : rows.filter((row) => row.rev === "R").length / rows.length;
  const digitSum = (Math.floor(n / 10) + (n % 10) + Math.floor(mr / 10) + (mr % 10)) % 10;
  const boost = digitSum === 5 ? 0.08 : digitSum === 9 ? 0.05 : 0;

  return Math.min(0.9, baseRate + boost);
}

function rankCandidates(
  history: HistoricalRow[],
  slot: CandidateSlotRequest,
  params: MonteCarloParams,
  limit: number,
): CandidatePrediction[] {
  const nTens = distributionForChannel(history, slot.period, (row) => Math.floor(row.n / 10), params);
  const nOnes = distributionForChannel(history, slot.period, (row) => row.n % 10, params);
  const mrTens = distributionForChannel(history, slot.period, (row) => Math.floor(row.mr / 10), params);
  const mrOnes = distributionForChannel(history, slot.period, (row) => row.mr % 10, params);

  const ranked: Array<Omit<CandidatePrediction, "relativeShare">> = [];

  for (let nTensDigit = 0; nTensDigit < 10; nTensDigit += 1) {
    for (let nOnesDigit = 0; nOnesDigit < 10; nOnesDigit += 1) {
      for (let mrTensDigit = 0; mrTensDigit < 10; mrTensDigit += 1) {
        for (let mrOnesDigit = 0; mrOnesDigit < 10; mrOnesDigit += 1) {
          const n = nTensDigit * 10 + nOnesDigit;
          const mr = mrTensDigit * 10 + mrOnesDigit;
          const probability =
            nTens[nTensDigit] *
            nOnes[nOnesDigit] *
            mrTens[mrTensDigit] *
            mrOnes[mrOnesDigit];

          const revP = revProbability(history, slot.period, n, mr);
          const rev: RevFlag = revP >= 0.5 ? "R" : "-";

          ranked.push({
            dateISO: slot.dateISO,
            period: slot.period,
            n,
            mr,
            rev,
            revProbability: revP,
            probability,
          });
        }
      }
    }
  }

  ranked.sort((a, b) => b.probability - a.probability);
  const topCandidates = ranked.slice(0, limit);
  const probabilitySum = topCandidates.reduce((sum, candidate) => sum + candidate.probability, 0);

  return topCandidates.map((candidate) => ({
    ...candidate,
    relativeShare: probabilitySum === 0 ? 0 : candidate.probability / probabilitySum,
  }));
}

export function buildMonteCarloCandidates(params: {
  history: HistoricalRow[];
  slots: CandidateSlotRequest[];
  top?: number;
}): CandidateResponse {
  const history = sortHistory(params.history);
  const { params: bestParams, score } = selectBestParams(history);
  const top = params.top ?? 6;
  const workingHistory = [...history];

  const slots = params.slots.map((slot) => {
    const priorHistory = workingHistory.filter((row) => {
      if (row.dateISO !== slot.dateISO) {
        return row.dateISO < slot.dateISO;
      }

      return PERIOD_ORDER[row.period] < PERIOD_ORDER[slot.period];
    });

    const candidates = rankCandidates(priorHistory, slot, bestParams, top);

    if (candidates[0]) {
      workingHistory.push({
        dateISO: slot.dateISO,
        period: slot.period,
        n: candidates[0].n,
        rev: candidates[0].rev,
        mr: candidates[0].mr,
      });
      workingHistory.sort((a, b) => {
        if (a.dateISO !== b.dateISO) {
          return a.dateISO.localeCompare(b.dateISO);
        }

        return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
      });
    }

    return { slot, candidates };
  });

  return {
    model: MONTE_CARLO_MODEL,
    selectedParams: bestParams,
    backtestMeanDigitError: Number(score.toFixed(4)),
    slots,
  };
}

export function generateMonteCarloRows(
  input: PredictionInput,
): { rows: PredictionRow[]; selectedParams: MonteCarloParams; backtestMeanDigitError: number } {
  const history = sortHistory(input.history);
  const { params: bestParams, score } = selectBestParams(history);
  const workingHistory = [...history];

  const rows = input.slots.map((slot) => {
    const priorHistory = workingHistory.filter((row) => {
      if (row.dateISO !== slot.dateISO) {
        return row.dateISO < slot.dateISO;
      }

      return PERIOD_ORDER[row.period] < PERIOD_ORDER[slot.period];
    });

    const candidates = rankCandidates(priorHistory, slot, bestParams, 1);
    const best = candidates[0];
    const row: PredictionRow = {
      dateISO: slot.dateISO,
      weekdayEs: slot.weekdayEs,
      period: slot.period,
      n: best.n,
      rev: best.rev,
      mr: best.mr,
      source: "fallback",
    };

    workingHistory.push({
      dateISO: row.dateISO,
      period: row.period,
      n: row.n,
      rev: row.rev,
      mr: row.mr,
    });
    workingHistory.sort((a, b) => {
      if (a.dateISO !== b.dateISO) {
        return a.dateISO.localeCompare(b.dateISO);
      }

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

export class MonteCarloPredictionEngine implements PredictionEngine {
  async generate(input: PredictionInput): Promise<PredictionEngineResult> {
    const { rows } = generateMonteCarloRows(input);
    return { rows, model: MONTE_CARLO_MODEL };
  }
}

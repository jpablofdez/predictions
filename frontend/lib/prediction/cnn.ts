import type {
  DrawPeriod,
  HistoricalRow,
  PredictionEngine,
  PredictionEngineResult,
  PredictionInput,
  PredictionRow,
  RevFlag,
} from "../types";

export const CNN_WIN_NODES_MODEL = "CNN Evolutionary Win-Nodes";

// ── Types ────────────────────────────────────────────────────────────────────

type DigitChannel = "nTens" | "nOnes" | "mrTens" | "mrOnes";

const CHANNELS: DigitChannel[] = ["nTens", "nOnes", "mrTens", "mrOnes"];

const PERIOD_ORDER: Record<DrawPeriod, number> = {
  MEDIODIA: 0,
  TARDE: 1,
  NOCHE: 2,
};

type Conv1DFilter = {
  weights: number[];
  bias: number;
};

type WinNode = {
  id: number;
  filters: Record<DigitChannel, Conv1DFilter[]>;
  poolingStride: number;
  denseWeights: Record<DigitChannel, number[][]>;
  denseBias: Record<DigitChannel, number[]>;
  fitness: number;
  wins: number;
  temperature: number;
};

export type CNNStrategyResult = {
  period: DrawPeriod;
  candidates: Array<{
    n: number;
    mr: number;
    rev: RevFlag;
    confidence: number;
    nodeConsensus: number;
    suggestedBet: number;
  }>;
};

export type FullStrategyResult = {
  model: string;
  totalBudget: number;
  strategies: CNNStrategyResult[];
  evolutionStats: {
    generations: number;
    survivingNodes: number;
    bestFitness: number;
    avgFitness: number;
  };
};

// ── Deterministic RNG ────────────────────────────────────────────────────────

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRng(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next, (next >>> 0) / 0x100000000];
}

function seededGaussian(seed: number): [number, number] {
  let [s1, u1] = nextRng(seed);
  let [s2, u2] = nextRng(s1);
  u1 = Math.max(1e-10, u1);
  const mag = Math.sqrt(-2 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), s2];
}

// ── Data preparation ─────────────────────────────────────────────────────────

function sortHistory(history: HistoricalRow[]): HistoricalRow[] {
  return [...history].sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
    return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
  });
}

function extractChannels(history: HistoricalRow[]): Record<DigitChannel, number[]> {
  const result: Record<DigitChannel, number[]> = {
    nTens: [], nOnes: [], mrTens: [], mrOnes: [],
  };
  for (const row of history) {
    result.nTens.push(Math.floor(row.n / 10));
    result.nOnes.push(row.n % 10);
    result.mrTens.push(Math.floor(row.mr / 10));
    result.mrOnes.push(row.mr % 10);
  }
  return result;
}

function extractPeriodChannels(
  history: HistoricalRow[],
  period: DrawPeriod,
): Record<DigitChannel, number[]> {
  return extractChannels(history.filter((r) => r.period === period));
}

// ── 1D Convolution operations ────────────────────────────────────────────────

function conv1d(input: number[], filter: Conv1DFilter): number[] {
  const kernelSize = filter.weights.length;
  const output: number[] = [];
  for (let i = 0; i <= input.length - kernelSize; i++) {
    let sum = filter.bias;
    for (let k = 0; k < kernelSize; k++) {
      sum += input[i + k] * filter.weights[k];
    }
    output.push(Math.max(0, sum)); // ReLU activation
  }
  return output;
}

function globalMaxPool(input: number[]): number {
  if (input.length === 0) return 0;
  return Math.max(...input);
}

function globalAvgPool(input: number[]): number {
  if (input.length === 0) return 0;
  return input.reduce((a, b) => a + b, 0) / input.length;
}

function softmax(scores: number[], temperature: number): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

// ── CNN forward pass per channel ─────────────────────────────────────────────

function forwardChannel(
  input: number[],
  filters: Conv1DFilter[],
  denseW: number[][],
  denseB: number[],
  temperature: number,
): number[] {
  // Apply each filter and pool
  const features: number[] = [];
  for (const filter of filters) {
    const convOut = conv1d(input, filter);
    features.push(globalMaxPool(convOut));
    features.push(globalAvgPool(convOut));
  }

  // Dense layer → 10 digit scores
  const scores: number[] = [];
  for (let d = 0; d < 10; d++) {
    let s = denseB[d];
    for (let f = 0; f < features.length; f++) {
      s += features[f] * (denseW[d]?.[f] ?? 0);
    }
    scores.push(s);
  }

  return softmax(scores, temperature);
}

// ── Node initialization ──────────────────────────────────────────────────────

const FILTER_SIZES = [3, 5, 7, 11];
const FILTERS_PER_CHANNEL = FILTER_SIZES.length * 2; // 2 filters per kernel size

function createNode(id: number, seed: number): WinNode {
  let s = seed;
  const filters: Record<string, Conv1DFilter[]> = {};
  const denseWeights: Record<string, number[][]> = {};
  const denseBias: Record<string, number[]> = {};
  const featureCount = FILTERS_PER_CHANNEL * 2; // max + avg per filter

  for (const ch of CHANNELS) {
    const chFilters: Conv1DFilter[] = [];
    for (const size of FILTER_SIZES) {
      for (let f = 0; f < 2; f++) {
        const weights: number[] = [];
        for (let w = 0; w < size; w++) {
          let g: number;
          [g, s] = seededGaussian(s);
          weights.push(g * 0.3);
        }
        let [ns, bv] = nextRng(s);
        s = ns;
        chFilters.push({ weights, bias: (bv - 0.5) * 0.1 });
      }
    }
    filters[ch] = chFilters;

    const dw: number[][] = [];
    const db: number[] = [];
    for (let d = 0; d < 10; d++) {
      const row: number[] = [];
      for (let f = 0; f < featureCount; f++) {
        let g: number;
        [g, s] = seededGaussian(s);
        row.push(g * 0.15);
      }
      dw.push(row);
      let [ns, bv] = nextRng(s);
      s = ns;
      db.push((bv - 0.5) * 0.05);
    }
    denseWeights[ch] = dw;
    denseBias[ch] = db;
  }

  let [ns, tv] = nextRng(s);
  const temperature = 0.5 + tv * 1.5; // [0.5, 2.0]

  return {
    id,
    filters: filters as Record<DigitChannel, Conv1DFilter[]>,
    poolingStride: 2,
    denseWeights: denseWeights as Record<DigitChannel, number[][]>,
    denseBias: denseBias as Record<DigitChannel, number[]>,
    fitness: 0,
    wins: 0,
    temperature,
  };
}

// ── Node prediction ──────────────────────────────────────────────────────────

const INPUT_WINDOW = 60;

function nodePredict(
  node: WinNode,
  channels: Record<DigitChannel, number[]>,
): Record<DigitChannel, number[]> {
  const result: Record<string, number[]> = {};
  for (const ch of CHANNELS) {
    const input = channels[ch].slice(-INPUT_WINDOW);
    if (input.length < 3) {
      result[ch] = Array.from({ length: 10 }, () => 0.1);
      continue;
    }
    // Normalize input to [0,1]
    const normalized = input.map((v) => v / 9);
    result[ch] = forwardChannel(
      normalized,
      node.filters[ch],
      node.denseWeights[ch],
      node.denseBias[ch],
      node.temperature,
    );
  }
  return result as Record<DigitChannel, number[]>;
}

// ── Fitness evaluation: ONLY wins count ──────────────────────────────────────

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 10 - d);
}

function evaluateNode(
  node: WinNode,
  history: HistoricalRow[],
  period: DrawPeriod,
): { fitness: number; wins: number } {
  const periodRows = history.filter((r) => r.period === period);
  if (periodRows.length < INPUT_WINDOW + 10) {
    return { fitness: 0, wins: 0 };
  }

  const EVAL_SIZE = Math.min(30, Math.floor(periodRows.length * 0.2));
  const trainEnd = periodRows.length - EVAL_SIZE;
  let wins = 0;
  let totalScore = 0;

  for (let i = trainEnd; i < periodRows.length; i++) {
    const trainSlice = periodRows.slice(0, i);
    const channels = extractChannels(trainSlice);
    const probs = nodePredict(node, channels);
    const actual = periodRows[i];

    const actualDigits = {
      nTens: Math.floor(actual.n / 10),
      nOnes: actual.n % 10,
      mrTens: Math.floor(actual.mr / 10),
      mrOnes: actual.mr % 10,
    };

    // Score: how much probability mass the node put on the correct digit
    let slotScore = 0;
    let exactMatches = 0;
    for (const ch of CHANNELS) {
      const correctDigit = actualDigits[ch];
      slotScore += probs[ch][correctDigit];

      // A "win" on this channel = the argmax matches
      const predicted = probs[ch].indexOf(Math.max(...probs[ch]));
      if (predicted === correctDigit) exactMatches++;
      // Partial credit for being close (distance 1)
      if (circularDistance(predicted, correctDigit) <= 1) slotScore += 0.3;
    }

    // A node "wins" if it got at least 2 exact digit matches
    if (exactMatches >= 2) wins++;
    // Bonus: exact N or exact MR
    const predN = probs.nTens.indexOf(Math.max(...probs.nTens)) * 10 +
                  probs.nOnes.indexOf(Math.max(...probs.nOnes));
    const predMR = probs.mrTens.indexOf(Math.max(...probs.mrTens)) * 10 +
                   probs.mrOnes.indexOf(Math.max(...probs.mrOnes));
    if (predN === actual.n) wins += 3;
    if (predMR === actual.mr) wins += 3;

    totalScore += slotScore;
  }

  // Fitness = wins-weighted. Only wins drive evolution.
  const fitness = wins * 10 + totalScore;
  return { fitness, wins };
}

// ── Evolution: crossover + mutation ──────────────────────────────────────────

function crossoverNodes(parent1: WinNode, parent2: WinNode, childId: number, seed: number): WinNode {
  let s = seed;
  const child = createNode(childId, seed);

  for (const ch of CHANNELS) {
    for (let f = 0; f < child.filters[ch].length; f++) {
      let [ns, r] = nextRng(s);
      s = ns;
      // Take filter from parent1 or parent2 based on coin flip
      const source = r < 0.5 ? parent1 : parent2;
      if (source.filters[ch][f]) {
        child.filters[ch][f] = {
          weights: [...source.filters[ch][f].weights],
          bias: source.filters[ch][f].bias,
        };
      }
    }

    for (let d = 0; d < 10; d++) {
      let [ns, r] = nextRng(s);
      s = ns;
      const source = r < 0.5 ? parent1 : parent2;
      child.denseWeights[ch][d] = [...(source.denseWeights[ch][d] ?? [])];
      child.denseBias[ch][d] = source.denseBias[ch][d] ?? 0;
    }
  }

  child.temperature = (parent1.temperature + parent2.temperature) / 2;
  return child;
}

function mutateNode(node: WinNode, mutationRate: number, seed: number): void {
  let s = seed;
  for (const ch of CHANNELS) {
    for (const filter of node.filters[ch]) {
      for (let w = 0; w < filter.weights.length; w++) {
        let [ns, r] = nextRng(s);
        s = ns;
        if (r < mutationRate) {
          let g: number;
          [g, s] = seededGaussian(s);
          filter.weights[w] += g * 0.05;
        }
      }
    }
    for (let d = 0; d < 10; d++) {
      for (let f = 0; f < (node.denseWeights[ch][d]?.length ?? 0); f++) {
        let [ns, r] = nextRng(s);
        s = ns;
        if (r < mutationRate) {
          let g: number;
          [g, s] = seededGaussian(s);
          node.denseWeights[ch][d][f] += g * 0.03;
        }
      }
    }
  }
  // Mutate temperature slightly
  let [ns, r] = nextRng(s);
  if (r < mutationRate * 2) {
    let g: number;
    [g] = seededGaussian(ns);
    node.temperature = Math.max(0.3, Math.min(3.0, node.temperature + g * 0.1));
  }
}

// ── Main evolutionary loop ───────────────────────────────────────────────────

const POPULATION_SIZE = 24;
const GENERATIONS = 12;
const ELITE_COUNT = 4;
const MUTATION_RATE = 0.15;

function evolveForPeriod(
  history: HistoricalRow[],
  period: DrawPeriod,
  baseSeed: number,
): WinNode[] {
  let s = baseSeed;

  // Initialize population
  let population: WinNode[] = [];
  for (let i = 0; i < POPULATION_SIZE; i++) {
    let [ns] = nextRng(s);
    s = ns;
    population.push(createNode(i, s));
  }

  for (let gen = 0; gen < GENERATIONS; gen++) {
    // Evaluate fitness — ONLY WINS COUNT
    for (const node of population) {
      const result = evaluateNode(node, history, period);
      node.fitness = result.fitness;
      node.wins = result.wins;
    }

    // Sort by fitness (wins-driven)
    population.sort((a, b) => b.fitness - a.fitness);

    // Keep elite
    const nextGen: WinNode[] = population.slice(0, ELITE_COUNT);

    // Fill rest with offspring of winners
    let childId = POPULATION_SIZE;
    while (nextGen.length < POPULATION_SIZE) {
      // Tournament selection: pick 2 random winners (top half)
      const topHalf = Math.ceil(population.length / 2);
      let [ns1, r1] = nextRng(s);
      s = ns1;
      let [ns2, r2] = nextRng(s);
      s = ns2;
      const p1 = population[Math.floor(r1 * topHalf)];
      const p2 = population[Math.floor(r2 * topHalf)];

      let [ns3] = nextRng(s);
      s = ns3;
      const child = crossoverNodes(p1, p2, childId++, s);
      mutateNode(child, MUTATION_RATE, s ^ (gen * 0x9e3779b1));
      nextGen.push(child);
    }

    population = nextGen;
  }

  // Final evaluation
  for (const node of population) {
    const result = evaluateNode(node, history, period);
    node.fitness = result.fitness;
    node.wins = result.wins;
  }
  population.sort((a, b) => b.fitness - a.fitness);

  return population;
}

// ── Ensemble prediction from evolved nodes ───────────────────────────────────

function ensemblePrediction(
  nodes: WinNode[],
  channels: Record<DigitChannel, number[]>,
  topK: number,
): Record<DigitChannel, number[]> {
  const top = nodes.slice(0, topK);
  const totalFitness = top.reduce((s, n) => s + Math.max(1, n.fitness), 0);

  const ensemble: Record<string, number[]> = {};
  for (const ch of CHANNELS) {
    ensemble[ch] = Array.from({ length: 10 }, () => 0);
  }

  for (const node of top) {
    const weight = Math.max(1, node.fitness) / totalFitness;
    const probs = nodePredict(node, channels);
    for (const ch of CHANNELS) {
      for (let d = 0; d < 10; d++) {
        ensemble[ch][d] += probs[ch][d] * weight;
      }
    }
  }

  return ensemble as Record<DigitChannel, number[]>;
}

// ── Build top candidates from digit distributions ────────────────────────────

function topCandidatesFromDistributions(
  nTens: number[],
  nOnes: number[],
  mrTens: number[],
  mrOnes: number[],
  revRate: number,
  limit: number,
): Array<{ n: number; mr: number; rev: RevFlag; confidence: number }> {
  const candidates: Array<{ n: number; mr: number; rev: RevFlag; confidence: number }> = [];

  // Get top 4 digits per channel for efficient search
  const topDigits = (dist: number[]) =>
    dist.map((p, d) => ({ d, p })).sort((a, b) => b.p - a.p).slice(0, 4);

  const tNT = topDigits(nTens);
  const tNO = topDigits(nOnes);
  const tMT = topDigits(mrTens);
  const tMO = topDigits(mrOnes);

  for (const nt of tNT) {
    for (const no of tNO) {
      for (const mt of tMT) {
        for (const mo of tMO) {
          const n = nt.d * 10 + no.d;
          const mr = mt.d * 10 + mo.d;
          const confidence = nt.p * no.p * mt.p * mo.p;
          const rev: RevFlag = revRate >= 0.5 ? "R" : "-";
          candidates.push({ n, mr, rev, confidence });
        }
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates.slice(0, limit);
}

// ── Public: Generate strategy for a date with budget ─────────────────────────

export function generateCNNStrategy(
  history: HistoricalRow[],
  dateISO: string,
  budget: number,
): FullStrategyResult {
  const sorted = sortHistory(history);
  const baseSeed = hashSeed(`cnn-win-nodes:${dateISO}`);
  const periods: DrawPeriod[] = ["MEDIODIA", "TARDE", "NOCHE"];

  const strategies: CNNStrategyResult[] = [];
  let totalConfidence = 0;
  const periodConfidences: number[] = [];

  for (const period of periods) {
    const periodSeed = hashSeed(`${baseSeed}:${period}`);
    const evolvedNodes = evolveForPeriod(sorted, period, periodSeed);

    // Get channels for prediction (all history up to target date)
    const priorHistory = sorted.filter((r) => r.dateISO < dateISO);
    const periodHistory = priorHistory.filter((r) => r.period === period);
    const channels = extractChannels(periodHistory);

    // Ensemble prediction from top evolved nodes
    const probs = ensemblePrediction(evolvedNodes, channels, ELITE_COUNT);

    // Rev rate
    const periodRows = sorted.filter((r) => r.period === period);
    const revRate = periodRows.length > 0
      ? periodRows.filter((r) => r.rev === "R").length / periodRows.length
      : 0.3;

    const candidates = topCandidatesFromDistributions(
      probs.nTens, probs.nOnes, probs.mrTens, probs.mrOnes,
      revRate, 5,
    );

    // Node consensus: how many top nodes agree on the #1 candidate
    const topN = candidates[0]?.n ?? 0;
    const topMR = candidates[0]?.mr ?? 0;
    let consensusCount = 0;
    for (let i = 0; i < Math.min(ELITE_COUNT, evolvedNodes.length); i++) {
      const np = nodePredict(evolvedNodes[i], channels);
      const predN = np.nTens.indexOf(Math.max(...np.nTens)) * 10 +
                    np.nOnes.indexOf(Math.max(...np.nOnes));
      const predMR = np.mrTens.indexOf(Math.max(...np.mrTens)) * 10 +
                     np.mrOnes.indexOf(Math.max(...np.mrOnes));
      if (predN === topN && predMR === topMR) consensusCount++;
    }
    const nodeConsensus = consensusCount / ELITE_COUNT;

    const maxConf = candidates[0]?.confidence ?? 0;
    periodConfidences.push(maxConf * (1 + nodeConsensus));
    totalConfidence += maxConf * (1 + nodeConsensus);

    strategies.push({
      period,
      candidates: candidates.map((c) => ({
        ...c,
        nodeConsensus,
        suggestedBet: 0, // filled below
      })),
    });
  }

  // Distribute budget proportional to confidence
  for (let i = 0; i < strategies.length; i++) {
    const share = totalConfidence > 0 ? periodConfidences[i] / totalConfidence : 1 / 3;
    const periodBudget = Math.round(budget * share);

    // Distribute within period: 50% top pick, 30% #2, 20% #3
    const internalSplits = [0.5, 0.3, 0.2];
    for (let j = 0; j < strategies[i].candidates.length; j++) {
      strategies[i].candidates[j].suggestedBet = Math.round(
        periodBudget * (internalSplits[j] ?? 0),
      );
    }
  }

  // Collect evolution stats from last period's evolution (representative)
  const lastPeriodNodes = evolveForPeriod(sorted, "NOCHE", hashSeed(`${baseSeed}:NOCHE`));
  const survivingWithWins = lastPeriodNodes.filter((n) => n.wins > 0).length;

  return {
    model: CNN_WIN_NODES_MODEL,
    totalBudget: budget,
    strategies,
    evolutionStats: {
      generations: GENERATIONS,
      survivingNodes: survivingWithWins,
      bestFitness: lastPeriodNodes[0]?.fitness ?? 0,
      avgFitness: lastPeriodNodes.reduce((s, n) => s + n.fitness, 0) / lastPeriodNodes.length,
    },
  };
}

// ── PredictionEngine interface ───────────────────────────────────────────────

export class CNNWinNodesPredictionEngine implements PredictionEngine {
  async generate(input: PredictionInput): Promise<PredictionEngineResult> {
    const sorted = sortHistory(input.history);
    const periods: DrawPeriod[] = ["MEDIODIA", "TARDE", "NOCHE"];

    // Evolve per period
    const evolvedByPeriod: Record<string, WinNode[]> = {};
    for (const period of periods) {
      const seed = hashSeed(`cnn-evo:${period}:${input.from}`);
      evolvedByPeriod[period] = evolveForPeriod(sorted, period, seed);
    }

    const rows: PredictionRow[] = input.slots.map((slot) => {
      const priorHistory = sorted.filter((r) => {
        if (r.dateISO !== slot.dateISO) return r.dateISO < slot.dateISO;
        return PERIOD_ORDER[r.period] < PERIOD_ORDER[slot.period];
      });
      const periodHistory = priorHistory.filter((r) => r.period === slot.period);
      const channels = extractChannels(periodHistory);
      const nodes = evolvedByPeriod[slot.period] ?? [];
      const probs = ensemblePrediction(nodes, channels, ELITE_COUNT);

      const pickDigit = (dist: number[]) => dist.indexOf(Math.max(...dist));
      const n = pickDigit(probs.nTens) * 10 + pickDigit(probs.nOnes);
      const mr = pickDigit(probs.mrTens) * 10 + pickDigit(probs.mrOnes);

      const periodRows = sorted.filter((r) => r.period === slot.period);
      const revRate = periodRows.length > 0
        ? periodRows.filter((r) => r.rev === "R").length / periodRows.length
        : 0.3;
      const rev: RevFlag = revRate >= 0.5 ? "R" : "-";

      return {
        dateISO: slot.dateISO,
        weekdayEs: slot.weekdayEs,
        period: slot.period,
        n,
        rev,
        mr,
        source: "fallback" as const,
      };
    });

    return { rows, model: CNN_WIN_NODES_MODEL };
  }
}

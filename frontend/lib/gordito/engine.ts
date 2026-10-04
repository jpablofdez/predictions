import type { GorditoCandidate } from "./types";

// ── Deterministic seeded RNG ──────────────────────────────────────────────────

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function seedFloat(seed: number): number {
  return (seed >>> 0) / 0x100000000;
}

function digitalRoot(n: number): number {
  if (n === 0) return 0;
  return 1 + ((Math.abs(n) - 1) % 9);
}

// ── Data types ────────────────────────────────────────────────────────────────

type LotteryEntry = { numero: number; serie: number };
type NTREntry = { n: number; mr: number };

// ── Method 1: Frequency-Recency with Exponential Decay ────────────────────────

function frequencyRecencyDigits(
  values: number[],
  decayRate: number,
): number[] {
  const hist = new Float64Array(10).fill(0.01);
  for (let i = 0; i < values.length; i++) {
    const age = values.length - i - 1;
    hist[values[i]] += Math.exp(-age / decayRate);
  }
  return Array.from(hist);
}

// ── Method 2: Markov Transition Matrix ────────────────────────────────────────

function transitionMatrix(values: number[], decay: number): number[][] {
  const m = Array.from({ length: 10 }, () => new Float64Array(10).fill(0.001));
  for (let i = 1; i < values.length; i++) {
    const age = values.length - i - 1;
    m[values[i - 1]][values[i]] += Math.exp(-age / decay);
  }
  return m.map((row) => Array.from(row));
}

// ── Method 3: Gap Pressure ────────────────────────────────────────────────────

function gapPressure(values: number[]): number[] {
  const lastSeen = new Array(10).fill(-1);
  for (let i = 0; i < values.length; i++) lastSeen[values[i]] = i;
  const gaps = new Float64Array(10);
  for (let d = 0; d < 10; d++) {
    const gap = lastSeen[d] === -1 ? values.length : values.length - lastSeen[d];
    gaps[d] = Math.log1p(gap) * 0.8;
  }
  return Array.from(gaps);
}

// ── Method 4: Fibonacci/Lucas Lag Resonance ───────────────────────────────────

const FIB_LAGS = [1, 2, 3, 5, 8, 13, 21, 34];

function fibLagResonance(values: number[]): number[] {
  const scores = new Float64Array(10).fill(0);
  for (const lag of FIB_LAGS) {
    if (lag < values.length) {
      const v = values[values.length - lag];
      scores[v] += 1.0 / Math.sqrt(lag);
    }
  }
  return Array.from(scores);
}

// ── Method 5: Cross-Lottery Correlation ───────────────────────────────────────

function crossCorrelation(
  lotteryDigits: number[],
  ntrDigits: number[],
  targetDigitChannel: number[],
  decay: number,
): number[] {
  const cooccurrence = Array.from({ length: 10 }, () => new Float64Array(10).fill(0.001));
  const minLen = Math.min(lotteryDigits.length, ntrDigits.length);

  for (let i = 0; i < minLen; i++) {
    const age = minLen - i - 1;
    const w = Math.exp(-age / decay);
    cooccurrence[ntrDigits[i]][lotteryDigits[i]] += w;
  }

  const scores = new Float64Array(10).fill(0);
  if (targetDigitChannel.length === 0) return Array.from(scores);

  const lastNTR = targetDigitChannel[targetDigitChannel.length - 1];
  const row = cooccurrence[lastNTR];
  const sum = row.reduce((a, b) => a + b, 0);
  for (let d = 0; d < 10; d++) {
    scores[d] = (row[d] / sum) * 3.0;
  }
  return Array.from(scores);
}

// ── Method 6: Momentum/Streak Detection ───────────────────────────────────────

function momentum(values: number[]): number[] {
  const scores = new Float64Array(10).fill(0);
  if (values.length < 3) return Array.from(scores);

  const recent = values.slice(-5);
  const counts = new Float64Array(10);
  for (const v of recent) counts[v]++;

  for (let d = 0; d < 10; d++) {
    if (counts[d] >= 2) scores[d] += counts[d] * 0.6;
  }
  return Array.from(scores);
}

// ── Method 7: Second-Order Markov ─────────────────────────────────────────────

function secondOrderTransition(values: number[]): number[] {
  const scores = new Float64Array(10).fill(0.01);
  if (values.length < 3) return Array.from(scores);

  const lastTwo = values[values.length - 2] * 10 + values[values.length - 1];
  const counts: Record<number, Float64Array> = {};

  for (let i = 2; i < values.length; i++) {
    const pair = values[i - 2] * 10 + values[i - 1];
    if (!counts[pair]) counts[pair] = new Float64Array(10).fill(0.001);
    const age = values.length - i - 1;
    counts[pair][values[i]] += Math.exp(-age / 30);
  }

  if (counts[lastTwo]) {
    const row = counts[lastTwo];
    const sum = row.reduce((a, b) => a + b, 0);
    for (let d = 0; d < 10; d++) scores[d] = (row[d] / sum) * 2.0;
  }
  return Array.from(scores);
}

// ── Softmax digit selection ───────────────────────────────────────────────────

function softmaxSelect(scores: number[], temperature: number, seed: number): { digit: number; probs: number[] } {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sum);

  const roll = seedFloat(lcg(seed));
  let cum = 0;
  for (let d = 0; d < 10; d++) {
    cum += probs[d];
    if (roll < cum) return { digit: d, probs };
  }
  return { digit: 9, probs };
}

// ── Ensemble scoring for a single digit channel ───────────────────────────────

function ensembleDigitScores(
  values: number[],
  ntrCrossChannel: number[],
  lastDigit: number | null,
  dateISO: string,
  channelSeed: number,
): number[] {
  const freq = frequencyRecencyDigits(values, 15);
  const trans = transitionMatrix(values, 20);
  const gap = gapPressure(values);
  const fib = fibLagResonance(values);
  const cross = crossCorrelation(values, ntrCrossChannel, ntrCrossChannel, 25);
  const mom = momentum(values);
  const secondOrd = secondOrderTransition(values);

  const scores = new Float64Array(10);
  const dateDR = digitalRoot(dateISO.split("-").map(Number).reduce((a, b) => a + b, 0));

  for (let d = 0; d < 10; d++) {
    let s = 0;
    s += freq[d] * 2.0;
    if (lastDigit !== null) s += trans[lastDigit][d] * 2.5;
    s += gap[d] * 1.2;
    s += fib[d] * 1.5;
    s += cross[d] * 1.0;
    s += mom[d] * 0.8;
    s += secondOrd[d] * 1.8;

    // Date numerology bonus
    const dRoot = d === 0 ? 9 : d;
    if (dRoot === dateDR) s += 1.2;
    if ((dRoot + dateDR) % 9 === 0) s += 0.8;

    // Seeded jitter
    const jSeed = lcg(channelSeed ^ (d * 0x9e3779b1));
    s += (seedFloat(jSeed) - 0.5) * 0.3;

    scores[d] = s;
  }

  return Array.from(scores);
}

// ── Top-N candidates via Monte Carlo ──────────────────────────────────────────

type DigitChannels = {
  numTens: number[];
  numOnes: number[];
  serH: number[];
  serT: number[];
  serO: number[];
};

function extractLotteryDigits(history: LotteryEntry[]): DigitChannels {
  const ch: DigitChannels = { numTens: [], numOnes: [], serH: [], serT: [], serO: [] };
  for (const r of history) {
    ch.numTens.push(Math.floor(r.numero / 10));
    ch.numOnes.push(r.numero % 10);
    ch.serH.push(Math.floor(r.serie / 100));
    ch.serT.push(Math.floor((r.serie % 100) / 10));
    ch.serO.push(r.serie % 10);
  }
  return ch;
}

function extractNTRDigits(ntr: NTREntry[]): { nTens: number[]; nOnes: number[]; mrTens: number[]; mrOnes: number[] } {
  const out = { nTens: [] as number[], nOnes: [] as number[], mrTens: [] as number[], mrOnes: [] as number[] };
  for (const r of ntr) {
    out.nTens.push(Math.floor(r.n / 10));
    out.nOnes.push(r.n % 10);
    out.mrTens.push(Math.floor(r.mr / 10));
    out.mrOnes.push(r.mr % 10);
  }
  return out;
}

// ── Hyperparameter configs for ensemble diversity ─────────────────────────────

const TEMPS = [0.6, 0.8, 1.0, 1.3, 1.6, 2.0];

export function generateGorditoPredictions(
  dateISO: string,
  lotteryHistory: LotteryEntry[],
  ntrHistory: NTREntry[],
  topN: number = 10,
): GorditoCandidate[] {
  const lDigits = extractLotteryDigits(lotteryHistory);
  const ntrDigits = extractNTRDigits(ntrHistory);

  const baseSeed = fnv1a(`gordito:${dateISO}:${lotteryHistory.length}:${ntrHistory.length}`);
  const candidateMap = new Map<string, { score: number; count: number; methods: Set<string> }>();

  const NUM_SAMPLES = 500;

  for (let sample = 0; sample < NUM_SAMPLES; sample++) {
    const sampleSeed = lcg(baseSeed ^ (sample * 0x85ebca6b));
    const tempIdx = sample % TEMPS.length;
    const temp = TEMPS[tempIdx];

    // Cross-correlation channels: use NTR digit channels to inform lottery digits
    const crossTens = ntrDigits.nTens.length > 0 ? ntrDigits.nTens : lDigits.numTens;
    const crossOnes = ntrDigits.nOnes.length > 0 ? ntrDigits.nOnes : lDigits.numOnes;
    const crossSerH = ntrDigits.mrTens.length > 0 ? ntrDigits.mrTens : lDigits.serH;
    const crossSerT = ntrDigits.mrOnes.length > 0 ? ntrDigits.mrOnes : lDigits.serT;

    const lastEntry = lotteryHistory.length > 0 ? lotteryHistory[lotteryHistory.length - 1] : null;

    // Score each digit channel
    const sTens = ensembleDigitScores(lDigits.numTens, crossTens, lastEntry ? Math.floor(lastEntry.numero / 10) : null, dateISO, sampleSeed ^ 0x1b873593);
    const sOnes = ensembleDigitScores(lDigits.numOnes, crossOnes, lastEntry ? lastEntry.numero % 10 : null, dateISO, sampleSeed ^ 0xe6546b64);
    const sSerH = ensembleDigitScores(lDigits.serH, crossSerH, lastEntry ? Math.floor(lastEntry.serie / 100) : null, dateISO, sampleSeed ^ 0xcc9e2d51);
    const sSerT = ensembleDigitScores(lDigits.serT, crossSerT, lastEntry ? Math.floor((lastEntry.serie % 100) / 10) : null, dateISO, sampleSeed ^ 0x85ebca6b);
    const sSerO = ensembleDigitScores(lDigits.serO, crossOnes, lastEntry ? lastEntry.serie % 10 : null, dateISO, sampleSeed ^ 0xc2b2ae35);

    // Select digits
    const { digit: nT, probs: pT } = softmaxSelect(sTens, temp, lcg(sampleSeed ^ 0x11));
    const { digit: nO, probs: pO } = softmaxSelect(sOnes, temp, lcg(sampleSeed ^ 0x22));
    const { digit: sH, probs: pH } = softmaxSelect(sSerH, temp, lcg(sampleSeed ^ 0x33));
    const { digit: sT, probs: pST } = softmaxSelect(sSerT, temp, lcg(sampleSeed ^ 0x44));
    const { digit: sO, probs: pSO } = softmaxSelect(sSerO, temp, lcg(sampleSeed ^ 0x55));

    const numero = nT * 10 + nO;
    const serie = sH * 100 + sT * 10 + sO;
    const key = `${numero.toString().padStart(2, "0")}-${serie.toString().padStart(3, "0")}`;

    // Combined probability as geometric mean
    const prob = Math.pow(pT[nT] * pO[nO] * pH[sH] * pST[sT] * pSO[sO], 1 / 5);

    const method = temp <= 0.8 ? "High-confidence" : temp <= 1.3 ? "Balanced" : "Exploratory";

    const existing = candidateMap.get(key);
    if (existing) {
      existing.score += prob;
      existing.count += 1;
      existing.methods.add(method);
    } else {
      candidateMap.set(key, { score: prob, count: 1, methods: new Set([method]) });
    }
  }

  // Rank by frequency-weighted score
  const ranked = Array.from(candidateMap.entries())
    .map(([key, val]) => {
      const [numStr, serStr] = key.split("-");
      return {
        numero: parseInt(numStr, 10),
        serie: parseInt(serStr, 10),
        score: val.score * Math.sqrt(val.count),
        confidence: val.count / NUM_SAMPLES,
        method: Array.from(val.methods).join(" + "),
      } satisfies GorditoCandidate;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  // Normalize confidence
  const maxConf = Math.max(...ranked.map((c) => c.confidence));
  for (const c of ranked) {
    c.confidence = c.confidence / maxConf;
  }

  return ranked;
}

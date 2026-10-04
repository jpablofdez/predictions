import type { DrawPeriod, PredictionEngine, PredictionEngineResult, PredictionInput, PredictionRow } from "../types";

export const KABBALAH_MODEL = "Kabbalah numerology";

// ── Sephirot: the 10 emanations of the Tree of Life ────────────────────────
// Each Sephirah has a numeric value (1-10) and vibrational affinity to certain digits
const SEPHIROT = [
  { name: "Keter",    value: 1,  affinity: [1, 0, 9] },   // Crown — unity, origin
  { name: "Chokmah",  value: 2,  affinity: [2, 8, 4] },   // Wisdom — duality
  { name: "Binah",    value: 3,  affinity: [3, 6, 9] },   // Understanding — form
  { name: "Chesed",   value: 4,  affinity: [4, 7, 1] },   // Mercy — expansion
  { name: "Gevurah",  value: 5,  affinity: [5, 2, 8] },   // Severity — contraction
  { name: "Tiferet",  value: 6,  affinity: [6, 3, 9] },   // Beauty — harmony
  { name: "Netzach",  value: 7,  affinity: [7, 1, 4] },   // Eternity — endurance
  { name: "Hod",      value: 8,  affinity: [8, 5, 2] },   // Splendor — intellect
  { name: "Yesod",    value: 9,  affinity: [9, 0, 3] },   // Foundation — connection
  { name: "Malkuth",  value: 10, affinity: [0, 5, 7] },   // Kingdom — manifestation
] as const;

// ── 22 Hebrew letter paths (connecting Sephirot on the Tree of Life) ────────
const HEBREW_LETTER_VALUES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,    // Aleph through Yod
  20, 30, 40, 50, 60, 70, 80, 90,    // Kaf through Tzadi
  100, 200, 300, 400,                  // Qof through Tav
] as const;

// ── Universal numeric sequences ─────────────────────────────────────────────
const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];
const LUCAS = [2, 1, 3, 4, 7, 11, 18, 29, 47, 76, 123, 199, 322, 521, 843];
const TRIANGULAR = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91];
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

// ── Planetary rulers for each draw period ───────────────────────────────────
// Kabbalistic planetary correspondence affects numeric vibration
const PERIOD_PLANET: Record<DrawPeriod, { planet: string; numeralBase: number; sephirah: number }> = {
  MEDIODIA: { planet: "Sol",     numeralBase: 6, sephirah: 5 },  // Tiferet (Sun)
  TARDE:    { planet: "Venus",   numeralBase: 7, sephirah: 6 },  // Netzach (Venus)
  NOCHE:    { planet: "Luna",    numeralBase: 9, sephirah: 8 },  // Yesod (Moon)
};

// ── Deterministic seeded RNG (same as fallback for consistency) ─────────────

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

// ── Gematria: digital root reduction ────────────────────────────────────────

function digitalRoot(n: number): number {
  if (n === 0) return 0;
  const abs = Math.abs(n);
  const r = 1 + ((abs - 1) % 9);
  return r;
}

// ── Date numerology ─────────────────────────────────────────────────────────

function dateSephirah(dateISO: string): number {
  const parts = dateISO.split("-").map(Number);
  const sum = parts[0] + parts[1] + parts[2];
  return digitalRoot(sum) - 1; // 0-indexed into SEPHIROT (0-9)
}

function dateHebrewPath(dateISO: string): number {
  const parts = dateISO.split("-").map(Number);
  const dayOfYear = parts[1] * 31 + parts[2]; // approximate
  return dayOfYear % 22; // index into 22 Hebrew letter paths
}

function dateUniversalCycle(dateISO: string): number {
  // Days since epoch, used to index into universal sequences
  const parts = dateISO.split("-").map(Number);
  return parts[0] * 365 + parts[1] * 30 + parts[2];
}

// ── Sephirotic resonance scoring ────────────────────────────────────────────
// How strongly a digit resonates with the current Sephirah

function sephiroticResonance(digit: number, sephirahIdx: number): number {
  const seph = SEPHIROT[sephirahIdx % 10];
  if ((seph.affinity as readonly number[]).includes(digit)) return 2.5;
  if (digitalRoot(digit + seph.value) === seph.value) return 1.8;
  if (digit === seph.value % 10) return 1.5;
  return 0.3;
}

// ── Universal sequence attractor ────────────────────────────────────────────
// Digits that appear in universal sequences at the current cycle position get a boost

function sequenceAttraction(digit: number, cycleDay: number): number {
  let score = 0;

  const fibDigit = FIBONACCI[cycleDay % FIBONACCI.length] % 10;
  if (digit === fibDigit) score += 1.8;
  else if (Math.abs(digit - fibDigit) <= 1 || Math.abs(digit - fibDigit) >= 9) score += 0.6;

  const lucDigit = LUCAS[cycleDay % LUCAS.length] % 10;
  if (digit === lucDigit) score += 1.4;
  else if (Math.abs(digit - lucDigit) <= 1 || Math.abs(digit - lucDigit) >= 9) score += 0.4;

  const triDigit = TRIANGULAR[cycleDay % TRIANGULAR.length] % 10;
  if (digit === triDigit) score += 1.2;

  const primeDigit = PRIMES[cycleDay % PRIMES.length] % 10;
  if (digit === primeDigit) score += 1.0;

  return score;
}

// ── Hebrew letter path modulation ───────────────────────────────────────────

function hebrewPathModulation(digit: number, pathIdx: number): number {
  const letterValue = HEBREW_LETTER_VALUES[pathIdx % 22];
  const letterDigit = digitalRoot(letterValue);
  const distance = Math.min(Math.abs(digit - letterDigit), 10 - Math.abs(digit - letterDigit));
  return Math.max(0, (5 - distance) / 5) * 1.6;
}

// ── Planetary period influence ──────────────────────────────────────────────

function planetaryInfluence(digit: number, period: DrawPeriod): number {
  const planet = PERIOD_PLANET[period];
  const base = planet.numeralBase;
  const seph = SEPHIROT[planet.sephirah];

  let score = 0;
  // Digits harmonious with the planetary numeral base
  if (digit === base % 10) score += 1.5;
  if (digitalRoot(digit + base) === digitalRoot(base * 2)) score += 1.0;
  // Sephirotic affinity of the ruling planet
  if ((seph.affinity as readonly number[]).includes(digit)) score += 0.8;

  return score;
}

// ── Historical frequency with kabbalistic weighting ─────────────────────────

type DigitHistogram = number[];

function buildKabbalisticHistogram(
  values: number[],
  sephirahIdx: number,
): DigitHistogram {
  const hist = Array.from({ length: 10 }, () => 0.1);

  for (let i = 0; i < values.length; i += 1) {
    const age = values.length - i - 1;
    // Decay based on multiples of 7 (days of creation) and 9 (Yesod completion)
    const decay7 = Math.exp(-age / 49); // 7*7
    const decay9 = Math.exp(-age / 81); // 9*9
    const kabbalisticDecay = (decay7 + decay9) / 2;
    const resonanceBoost = sephiroticResonance(values[i], sephirahIdx) * 0.3;
    hist[values[i]] += kabbalisticDecay * (1 + resonanceBoost);
  }

  return hist;
}

// ── Transition matrix with Tree of Life path weighting ──────────────────────

function buildKabbalisticTransition(
  values: number[],
  pathIdx: number,
): number[][] {
  const matrix = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0.01));

  for (let i = 1; i < values.length; i += 1) {
    const age = values.length - i - 1;
    const pathMod = hebrewPathModulation(values[i], pathIdx + i) * 0.15;
    const decay = Math.exp(-age / 36); // 6*6, Tiferet harmony
    matrix[values[i - 1]][values[i]] += decay * (1 + pathMod);
  }

  return matrix;
}

// ── Digit channel extraction ────────────────────────────────────────────────

type ChannelData = {
  nTens: number[];
  nOnes: number[];
  mrTens: number[];
  mrOnes: number[];
};

function extractChannels(history: PredictionInput["history"], period?: DrawPeriod): ChannelData {
  const sorted = [...history].sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
    const po: Record<DrawPeriod, number> = { MEDIODIA: 0, TARDE: 1, NOCHE: 2 };
    return po[a.period] - po[b.period];
  });

  const filtered = period ? sorted.filter((r) => r.period === period) : sorted;
  const channels: ChannelData = { nTens: [], nOnes: [], mrTens: [], mrOnes: [] };

  for (const row of filtered) {
    channels.nTens.push(Math.floor(row.n / 10));
    channels.nOnes.push(row.n % 10);
    channels.mrTens.push(Math.floor(row.mr / 10));
    channels.mrOnes.push(row.mr % 10);
  }

  return channels;
}

// ── Core digit prediction via Kabbalah scoring ──────────────────────────────

function predictDigit(params: {
  periodValues: number[];
  globalValues: number[];
  sephirahIdx: number;
  pathIdx: number;
  cycleDay: number;
  period: DrawPeriod;
  seed: number;
  lastDigit: number | null;
}): number {
  const { periodValues, globalValues, sephirahIdx, pathIdx, cycleDay, period, seed, lastDigit } = params;

  // Build kabbalistic models
  const periodHist = buildKabbalisticHistogram(periodValues, sephirahIdx);
  const globalHist = buildKabbalisticHistogram(globalValues, sephirahIdx);
  const periodTrans = buildKabbalisticTransition(periodValues, pathIdx);
  const globalTrans = buildKabbalisticTransition(globalValues, pathIdx);

  const scores: number[] = [];

  for (let d = 0; d < 10; d += 1) {
    // 1. Frequency (historical)
    const freqScore = periodHist[d] * 1.2 + globalHist[d] * 0.6;

    // 2. Transition (from last digit)
    let transScore = 0;
    if (lastDigit !== null) {
      transScore = periodTrans[lastDigit][d] * 1.3 + globalTrans[lastDigit][d] * 0.5;
    }

    // 3. Sephirotic resonance (Kabbalah core)
    const sephScore = sephiroticResonance(d, sephirahIdx) * 1.8;

    // 4. Universal sequence attraction
    const seqScore = sequenceAttraction(d, cycleDay) * 1.2;

    // 5. Hebrew letter path modulation
    const pathScore = hebrewPathModulation(d, pathIdx) * 1.0;

    // 6. Planetary period influence
    const planetScore = planetaryInfluence(d, period) * 0.9;

    // 7. Gematria harmony — digit's digital root relationship to the date's root
    const dateRoot = digitalRoot(sephirahIdx + 1);
    const digitRoot = d === 0 ? 9 : d; // 0 maps to completion (9)
    const gematriaHarmony = digitRoot === dateRoot ? 1.5
      : (digitRoot + dateRoot) === 9 ? 1.2
      : (digitRoot * dateRoot) % 9 === 0 ? 0.8
      : 0.2;

    // 8. Seeded jitter for determinism
    const jitterSeed = nextSeed(seed ^ (d * 0x9e3779b1));
    const jitter = ((jitterSeed >>> 0) / 0x100000000 - 0.5) * 0.04;

    scores.push(freqScore + transScore + sephScore + seqScore + pathScore + planetScore + gematriaHarmony + jitter);
  }

  // Softmax sampling with Kabbalistic temperature (based on Sephirah depth)
  const temperature = 1.2 + (sephirahIdx % 4) * 0.15;
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxScore) / temperature));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);

  // Deterministic weighted sampling
  const rollSeed = nextSeed(seed ^ 0x6a09e667);
  const roll = (rollSeed >>> 0) / 0x100000000;
  let cumulative = 0;
  for (let d = 0; d < 10; d += 1) {
    cumulative += probs[d];
    if (roll < cumulative) return d;
  }
  return 9;
}

// ── Rev prediction (Gevurah — judgment/severity) ────────────────────────────

function predictRev(
  history: PredictionInput["history"],
  period: DrawPeriod,
  n: number,
  mr: number,
  sephirahIdx: number,
  seed: number,
): "R" | "-" {
  // Base rate from history
  const periodRows = history.filter((r) => r.period === period);
  const revRate = periodRows.length > 0
    ? periodRows.filter((r) => r.rev === "R").length / periodRows.length
    : 0.35;

  // Gevurah (Sephirah 5) amplifies judgment/reventado probability
  const gevurahBoost = sephirahIdx === 4 ? 0.12 : 0;

  // Digits summing to 5 (Gevurah) or 9 (Yesod completion) increase R probability
  const digitSum = digitalRoot(n + mr);
  const numerologicalBoost = digitSum === 5 ? 0.08 : digitSum === 9 ? 0.06 : 0;

  const threshold = Math.round((revRate + gevurahBoost + numerologicalBoost) * 100);
  const rollSeed = nextSeed(seed ^ 0x510e527f);
  const roll = (rollSeed >>> 0) % 100;

  return roll < threshold ? "R" : "-";
}

// ── Public API ──────────────────────────────────────────────────────────────

export function generateKabbalahRows(input: PredictionInput): PredictionRow[] {
  const globalChannels = extractChannels(input.history);

  // Track last values per period for transition scoring
  const lastByPeriod: Record<DrawPeriod, { n: number; mr: number } | null> = {
    MEDIODIA: null, TARDE: null, NOCHE: null,
  };
  const sorted = [...input.history].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  for (const row of sorted) {
    lastByPeriod[row.period] = { n: row.n, mr: row.mr };
  }

  return input.slots.map((slot) => {
    const sephIdx = dateSephirah(slot.dateISO);
    const pathIdx = dateHebrewPath(slot.dateISO);
    const cycleDay = dateUniversalCycle(slot.dateISO);
    const baseSeed = hashSeed(`kabbalah:${slot.dateISO}:${slot.period}:${input.history.length}`);

    const periodChannels = extractChannels(input.history, slot.period);
    const last = lastByPeriod[slot.period];

    // Predict N (tens and ones digits separately)
    const nTens = predictDigit({
      periodValues: periodChannels.nTens,
      globalValues: globalChannels.nTens,
      sephirahIdx: sephIdx,
      pathIdx,
      cycleDay,
      period: slot.period,
      seed: baseSeed ^ 0x1b873593,
      lastDigit: last ? Math.floor(last.n / 10) : null,
    });

    const nOnes = predictDigit({
      periodValues: periodChannels.nOnes,
      globalValues: globalChannels.nOnes,
      sephirahIdx: sephIdx,
      pathIdx: pathIdx + 1,
      cycleDay: cycleDay + 1,
      period: slot.period,
      seed: baseSeed ^ 0xe6546b64,
      lastDigit: last ? last.n % 10 : null,
    });

    // Predict MR (tens and ones digits separately)
    const mrTens = predictDigit({
      periodValues: periodChannels.mrTens,
      globalValues: globalChannels.mrTens,
      sephirahIdx: (sephIdx + 3) % 10, // Offset by 3 (Binah — understanding)
      pathIdx: pathIdx + 7,
      cycleDay: cycleDay + 7,
      period: slot.period,
      seed: baseSeed ^ 0xcc9e2d51,
      lastDigit: last ? Math.floor(last.mr / 10) : null,
    });

    const mrOnes = predictDigit({
      periodValues: periodChannels.mrOnes,
      globalValues: globalChannels.mrOnes,
      sephirahIdx: (sephIdx + 6) % 10, // Offset by 6 (Tiferet — beauty/harmony)
      pathIdx: pathIdx + 11,
      cycleDay: cycleDay + 11,
      period: slot.period,
      seed: baseSeed ^ 0x85ebca6b,
      lastDigit: last ? last.mr % 10 : null,
    });

    const n = nTens * 10 + nOnes;
    const mr = mrTens * 10 + mrOnes;

    const rev = predictRev(input.history, slot.period, n, mr, sephIdx, baseSeed);

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
}

export class KabbalahPredictionEngine implements PredictionEngine {
  async generate(input: PredictionInput): Promise<PredictionEngineResult> {
    const rows = generateKabbalahRows(input);
    return { rows, model: KABBALAH_MODEL };
  }
}

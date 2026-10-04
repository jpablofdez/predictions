import type { LoteriaNacionalRow } from "./types";

export const LOTERIA_KABBALAH_MODEL = "Kabbalah numerology — Lotería Nacional";

// ── Sephirot: the 10 emanations of the Tree of Life ────────────────────────
const SEPHIROT = [
  { name: "Keter",    value: 1,  affinity: [1, 0, 9] },
  { name: "Chokmah",  value: 2,  affinity: [2, 8, 4] },
  { name: "Binah",    value: 3,  affinity: [3, 6, 9] },
  { name: "Chesed",   value: 4,  affinity: [4, 7, 1] },
  { name: "Gevurah",  value: 5,  affinity: [5, 2, 8] },
  { name: "Tiferet",  value: 6,  affinity: [6, 3, 9] },
  { name: "Netzach",  value: 7,  affinity: [7, 1, 4] },
  { name: "Hod",      value: 8,  affinity: [8, 5, 2] },
  { name: "Yesod",    value: 9,  affinity: [9, 0, 3] },
  { name: "Malkuth",  value: 10, affinity: [0, 5, 7] },
] as const;

const HEBREW_LETTER_VALUES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  20, 30, 40, 50, 60, 70, 80, 90,
  100, 200, 300, 400,
] as const;

const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];
const LUCAS = [2, 1, 3, 4, 7, 11, 18, 29, 47, 76, 123, 199, 322, 521, 843];
const TRIANGULAR = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91];
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

// Lotería Nacional draws on Sunday — ruled by Sol/Tiferet
const SUNDAY_PLANET = { planet: "Sol", numeralBase: 6, sephirah: 5 };

// ── Deterministic seeded RNG ─────────────────────────────────────────────────

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

function digitalRoot(n: number): number {
  if (n === 0) return 0;
  const abs = Math.abs(n);
  return 1 + ((abs - 1) % 9);
}

function dateSephirah(dateISO: string): number {
  const parts = dateISO.split("-").map(Number);
  const sum = parts[0] + parts[1] + parts[2];
  return digitalRoot(sum) - 1;
}

function dateHebrewPath(dateISO: string): number {
  const parts = dateISO.split("-").map(Number);
  const dayOfYear = parts[1] * 31 + parts[2];
  return dayOfYear % 22;
}

function dateUniversalCycle(dateISO: string): number {
  const parts = dateISO.split("-").map(Number);
  return parts[0] * 365 + parts[1] * 30 + parts[2];
}

function sephiroticResonance(digit: number, sephirahIdx: number): number {
  const seph = SEPHIROT[sephirahIdx % 10];
  if ((seph.affinity as readonly number[]).includes(digit)) return 2.5;
  if (digitalRoot(digit + seph.value) === seph.value) return 1.8;
  if (digit === seph.value % 10) return 1.5;
  return 0.3;
}

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

function hebrewPathModulation(digit: number, pathIdx: number): number {
  const letterValue = HEBREW_LETTER_VALUES[pathIdx % 22];
  const letterDigit = digitalRoot(letterValue);
  const distance = Math.min(Math.abs(digit - letterDigit), 10 - Math.abs(digit - letterDigit));
  return Math.max(0, (5 - distance) / 5) * 1.6;
}

function planetaryInfluence(digit: number): number {
  const base = SUNDAY_PLANET.numeralBase;
  const seph = SEPHIROT[SUNDAY_PLANET.sephirah];
  let score = 0;
  if (digit === base % 10) score += 1.5;
  if (digitalRoot(digit + base) === digitalRoot(base * 2)) score += 1.0;
  if ((seph.affinity as readonly number[]).includes(digit)) score += 0.8;
  return score;
}

function buildKabbalisticHistogram(values: number[], sephirahIdx: number): number[] {
  const hist = Array.from({ length: 10 }, () => 0.1);
  for (let i = 0; i < values.length; i += 1) {
    const age = values.length - i - 1;
    const decay7 = Math.exp(-age / 49);
    const decay9 = Math.exp(-age / 81);
    const kabbalisticDecay = (decay7 + decay9) / 2;
    const resonanceBoost = sephiroticResonance(values[i], sephirahIdx) * 0.3;
    hist[values[i]] += kabbalisticDecay * (1 + resonanceBoost);
  }
  return hist;
}

function buildKabbalisticTransition(values: number[], pathIdx: number): number[][] {
  const matrix = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0.01));
  for (let i = 1; i < values.length; i += 1) {
    const age = values.length - i - 1;
    const pathMod = hebrewPathModulation(values[i], pathIdx + i) * 0.15;
    const decay = Math.exp(-age / 36);
    matrix[values[i - 1]][values[i]] += decay * (1 + pathMod);
  }
  return matrix;
}

function predictDigit(params: {
  values: number[];
  sephirahIdx: number;
  pathIdx: number;
  cycleDay: number;
  seed: number;
  lastDigit: number | null;
}): number {
  const { values, sephirahIdx, pathIdx, cycleDay, seed, lastDigit } = params;

  const hist = buildKabbalisticHistogram(values, sephirahIdx);
  const trans = buildKabbalisticTransition(values, pathIdx);

  const scores: number[] = [];

  for (let d = 0; d < 10; d += 1) {
    const freqScore = hist[d] * 1.5;

    let transScore = 0;
    if (lastDigit !== null) {
      transScore = trans[lastDigit][d] * 1.5;
    }

    const sephScore = sephiroticResonance(d, sephirahIdx) * 1.8;
    const seqScore = sequenceAttraction(d, cycleDay) * 1.2;
    const pathScore = hebrewPathModulation(d, pathIdx) * 1.0;
    const planetScore = planetaryInfluence(d) * 0.9;

    const dateRoot = digitalRoot(sephirahIdx + 1);
    const digitRoot = d === 0 ? 9 : d;
    const gematriaHarmony = digitRoot === dateRoot ? 1.5
      : (digitRoot + dateRoot) === 9 ? 1.2
      : (digitRoot * dateRoot) % 9 === 0 ? 0.8
      : 0.2;

    const jitterSeed = nextSeed(seed ^ (d * 0x9e3779b1));
    const jitter = ((jitterSeed >>> 0) / 0x100000000 - 0.5) * 0.04;

    scores.push(freqScore + transScore + sephScore + seqScore + pathScore + planetScore + gematriaHarmony + jitter);
  }

  const temperature = 1.2 + (sephirahIdx % 4) * 0.15;
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxScore) / temperature));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);

  const rollSeed = nextSeed(seed ^ 0x6a09e667);
  const roll = (rollSeed >>> 0) / 0x100000000;
  let cumulative = 0;
  for (let d = 0; d < 10; d += 1) {
    cumulative += probs[d];
    if (roll < cumulative) return d;
  }
  return 9;
}

// ── Serie prediction: 3 digits (0-999) ──────────────────────────────────────

type HistoryEntry = { numero: number; serie: number };

function extractDigits(history: HistoryEntry[]): {
  numTens: number[]; numOnes: number[];
  serH: number[]; serT: number[]; serO: number[];
} {
  const numTens: number[] = [];
  const numOnes: number[] = [];
  const serH: number[] = [];
  const serT: number[] = [];
  const serO: number[] = [];
  for (const row of history) {
    numTens.push(Math.floor(row.numero / 10));
    numOnes.push(row.numero % 10);
    serH.push(Math.floor(row.serie / 100));
    serT.push(Math.floor((row.serie % 100) / 10));
    serO.push(row.serie % 10);
  }
  return { numTens, numOnes, serH, serT, serO };
}

export function generateLoteriaNacionalPrediction(
  dateISO: string,
  history: HistoryEntry[],
): { numero: number; serie: number } {
  const sephIdx = dateSephirah(dateISO);
  const pathIdx = dateHebrewPath(dateISO);
  const cycleDay = dateUniversalCycle(dateISO);
  const baseSeed = hashSeed(`loteria-nacional:${dateISO}:${history.length}`);

  const digits = extractDigits(history);
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  // Predict número (2 digits)
  const nTens = predictDigit({
    values: digits.numTens,
    sephirahIdx: sephIdx,
    pathIdx,
    cycleDay,
    seed: baseSeed ^ 0x1b873593,
    lastDigit: lastEntry ? Math.floor(lastEntry.numero / 10) : null,
  });

  const nOnes = predictDigit({
    values: digits.numOnes,
    sephirahIdx: sephIdx,
    pathIdx: pathIdx + 1,
    cycleDay: cycleDay + 1,
    seed: baseSeed ^ 0xe6546b64,
    lastDigit: lastEntry ? lastEntry.numero % 10 : null,
  });

  // Predict serie (3 digits)
  const sH = predictDigit({
    values: digits.serH,
    sephirahIdx: (sephIdx + 3) % 10,
    pathIdx: pathIdx + 5,
    cycleDay: cycleDay + 5,
    seed: baseSeed ^ 0xcc9e2d51,
    lastDigit: lastEntry ? Math.floor(lastEntry.serie / 100) : null,
  });

  const sT = predictDigit({
    values: digits.serT,
    sephirahIdx: (sephIdx + 6) % 10,
    pathIdx: pathIdx + 9,
    cycleDay: cycleDay + 9,
    seed: baseSeed ^ 0x85ebca6b,
    lastDigit: lastEntry ? Math.floor((lastEntry.serie % 100) / 10) : null,
  });

  const sO = predictDigit({
    values: digits.serO,
    sephirahIdx: (sephIdx + 8) % 10,
    pathIdx: pathIdx + 13,
    cycleDay: cycleDay + 13,
    seed: baseSeed ^ 0xc2b2ae35,
    lastDigit: lastEntry ? lastEntry.serie % 10 : null,
  });

  return {
    numero: nTens * 10 + nOnes,
    serie: sH * 100 + sT * 10 + sO,
  };
}

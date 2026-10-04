import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Papa from "papaparse";

const MONTHS = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const PERIOD_ORDER = { MEDIODIA: 0, TARDE: 1, NOCHE: 2 };
const DEFAULT_SLOTS = [
  { dateISO: "2026-03-30", period: "NOCHE" },
  { dateISO: "2026-03-31", period: "MEDIODIA" },
  { dateISO: "2026-03-31", period: "TARDE" },
  { dateISO: "2026-03-31", period: "NOCHE" },
];

const PARAM_SETS = [
  { name: "balanced", histDecay: 24, transDecay: 12, periodFreqW: 0.9, globalFreqW: 0.5, periodTransW: 1.1, globalTransW: 0.5, gapW: 0.35, momentumW: 0.15, temperature: 0.92 },
  { name: "recent", histDecay: 14, transDecay: 7, periodFreqW: 1.05, globalFreqW: 0.35, periodTransW: 1.3, globalTransW: 0.35, gapW: 0.25, momentumW: 0.2, temperature: 0.88 },
  { name: "long", histDecay: 40, transDecay: 18, periodFreqW: 0.8, globalFreqW: 0.65, periodTransW: 0.95, globalTransW: 0.65, gapW: 0.45, momentumW: 0.12, temperature: 1.0 },
  { name: "transition", histDecay: 20, transDecay: 8, periodFreqW: 0.7, globalFreqW: 0.35, periodTransW: 1.45, globalTransW: 0.6, gapW: 0.28, momentumW: 0.18, temperature: 0.84 },
  { name: "gap", histDecay: 28, transDecay: 14, periodFreqW: 0.78, globalFreqW: 0.45, periodTransW: 1.0, globalTransW: 0.45, gapW: 0.6, momentumW: 0.1, temperature: 0.95 },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeWord(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseSpanishDateLabel(rawLabel, defaultYear) {
  const trimmed = String(rawLabel ?? "").trim().replace(/^"|"$/g, "");
  const match = trimmed.match(
    /(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo),?\s*(\d{1,2})\s+de\s+([a-záéíóú]+)/i,
  );

  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[2], 10);
  const month = MONTHS[normalizeWord(match[3])];
  if (!month) {
    return null;
  }

  return `${defaultYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function detectPeriod(value) {
  const normalized = normalizeWord(String(value ?? ""));
  if (normalized.includes("mediodia")) return "MEDIODIA";
  if (normalized.includes("tarde")) return "TARDE";
  if (normalized.includes("noche")) return "NOCHE";
  return null;
}

function parsePredictionCsv(filePath, defaultYear) {
  const text = fs.readFileSync(filePath, "utf-8");
  const parsed = Papa.parse(text, { skipEmptyLines: false }).data;
  const rows = [];
  let currentDateISO = null;
  let currentPeriod = null;

  for (const rawRow of parsed) {
    const row = Array.isArray(rawRow) ? rawRow.map((cell) => String(cell ?? "").trim()) : [];
    if (row.length === 0) {
      continue;
    }

    const dateISO = parseSpanishDateLabel(row[1], defaultYear);
    if (dateISO) {
      currentDateISO = dateISO;
      currentPeriod = null;
      continue;
    }

    const period = detectPeriod(row[1]);
    if (period) {
      currentPeriod = period;
      continue;
    }

    if (!currentDateISO || !currentPeriod) {
      continue;
    }

    const n = Number.parseInt(row[2], 10);
    const rev = String(row[3] ?? "").toUpperCase() === "R" ? "R" : "-";
    const mr = Number.parseInt(row[4], 10);

    if (!Number.isFinite(n) || !Number.isFinite(mr)) {
      continue;
    }

    rows.push({
      dateISO: currentDateISO,
      period: currentPeriod,
      n,
      rev,
      mr,
    });
  }

  return rows;
}

function mergeRows(...sets) {
  const map = new Map();
  for (const rows of sets) {
    for (const row of rows) {
      map.set(`${row.dateISO}|${row.period}`, row);
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.dateISO !== b.dateISO) {
      return a.dateISO.localeCompare(b.dateISO);
    }
    return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
  });
}

function splitDigits(value) {
  return [Math.floor(value / 10), value % 10];
}

function softmax(scores, temperature) {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp((score - max) / temperature));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function circularDistance(a, b) {
  const delta = Math.abs(a - b);
  return Math.min(delta, 10 - delta);
}

function buildDigitSeries(history, period, extractor) {
  const samePeriod = [];
  const global = [];

  for (const row of history) {
    const digit = extractor(row);
    global.push(digit);
    if (row.period === period) {
      samePeriod.push(digit);
    }
  }

  return { samePeriod, global };
}

function weightedHistogram(values, decay) {
  const hist = Array.from({ length: 10 }, () => 0.1);
  const total = values.length;

  for (let index = 0; index < total; index += 1) {
    const age = total - index - 1;
    hist[values[index]] += Math.exp(-age / decay);
  }

  return hist;
}

function weightedTransition(values, decay) {
  const matrix = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0.05));
  const total = values.length;

  for (let index = 1; index < total; index += 1) {
    const age = total - index - 1;
    matrix[values[index - 1]][values[index]] += Math.exp(-age / decay);
  }

  return matrix;
}

function digitGap(values) {
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

function digitMomentum(values) {
  const momentum = Array.from({ length: 10 }, () => 0);

  for (let digit = 0; digit < 10; digit += 1) {
    const indexes = [];
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

function distributionForChannel(history, period, extractor, params) {
  const { samePeriod, global } = buildDigitSeries(history, period, extractor);
  const histPeriod = weightedHistogram(samePeriod, params.histDecay);
  const histGlobal = weightedHistogram(global, params.histDecay * 1.4);
  const transPeriod = weightedTransition(samePeriod, params.transDecay);
  const transGlobal = weightedTransition(global, params.transDecay * 1.5);
  const gapsPeriod = digitGap(samePeriod);
  const gapsGlobal = digitGap(global);
  const momentumPeriod = digitMomentum(samePeriod);
  const momentumGlobal = digitMomentum(global);
  const lastPeriod = samePeriod.length > 0 ? samePeriod[samePeriod.length - 1] : null;
  const lastGlobal = global.length > 0 ? global[global.length - 1] : null;

  const scores = [];

  for (let digit = 0; digit < 10; digit += 1) {
    const frequencyScore =
      histPeriod[digit] * params.periodFreqW +
      histGlobal[digit] * params.globalFreqW;

    const transitionScore =
      (lastPeriod === null ? 0 : transPeriod[lastPeriod][digit] * params.periodTransW) +
      (lastGlobal === null ? 0 : transGlobal[lastGlobal][digit] * params.globalTransW);

    const gapScore =
      (Math.log1p(gapsPeriod[digit]) + Math.log1p(gapsGlobal[digit])) * 0.5 * params.gapW;

    const momentumScore =
      (momentumPeriod[digit] + momentumGlobal[digit]) * 0.5 * params.momentumW;

    const proximityScore = lastPeriod === null ? 0 : (5 - circularDistance(digit, lastPeriod)) * 0.08;

    scores.push(frequencyScore + transitionScore + gapScore + momentumScore + proximityScore);
  }

  return softmax(scores, params.temperature);
}

function topPrediction(history, slot, params) {
  const nTens = distributionForChannel(history, slot.period, (row) => Math.floor(row.n / 10), params);
  const nOnes = distributionForChannel(history, slot.period, (row) => row.n % 10, params);
  const mrTens = distributionForChannel(history, slot.period, (row) => Math.floor(row.mr / 10), params);
  const mrOnes = distributionForChannel(history, slot.period, (row) => row.mr % 10, params);

  let best = null;
  for (let nT = 0; nT < 10; nT += 1) {
    for (let nO = 0; nO < 10; nO += 1) {
      for (let mT = 0; mT < 10; mT += 1) {
        for (let mO = 0; mO < 10; mO += 1) {
          const probability = nTens[nT] * nOnes[nO] * mrTens[mT] * mrOnes[mO];
          if (!best || probability > best.probability) {
            best = { n: nT * 10 + nO, mr: mT * 10 + mO, probability };
          }
        }
      }
    }
  }

  return best;
}

function scoreParams(history, params) {
  const holdout = Math.min(24, Math.floor(history.length * 0.18));
  if (holdout < 6) {
    return Number.POSITIVE_INFINITY;
  }

  let totalError = 0;
  for (let index = history.length - holdout; index < history.length; index += 1) {
    const train = history.slice(0, index);
    const slot = history[index];
    const predicted = topPrediction(train, slot, params);
    const [pnT, pnO] = splitDigits(predicted.n);
    const [pmT, pmO] = splitDigits(predicted.mr);
    const [anT, anO] = splitDigits(slot.n);
    const [amT, amO] = splitDigits(slot.mr);

    totalError +=
      circularDistance(pnT, anT) +
      circularDistance(pnO, anO) +
      circularDistance(pmT, amT) +
      circularDistance(pmO, amO);
  }

  return totalError / holdout;
}

function selectBestParams(history) {
  let best = { params: PARAM_SETS[0], score: Number.POSITIVE_INFINITY };

  for (const params of PARAM_SETS) {
    const score = scoreParams(history, params);
    if (score < best.score) {
      best = { params, score };
    }
  }

  return best;
}

function revProbability(history, period, n, mr) {
  const rows = history.filter((row) => row.period === period);
  const baseRate = rows.length === 0 ? 0.32 : rows.filter((row) => row.rev === "R").length / rows.length;
  const digitSum = (Math.floor(n / 10) + (n % 10) + Math.floor(mr / 10) + (mr % 10)) % 10;
  const boost = digitSum === 5 ? 0.08 : digitSum === 9 ? 0.05 : 0;
  return Math.min(0.9, baseRate + boost);
}

function rankCandidates(history, slot, params, limit) {
  const nTens = distributionForChannel(history, slot.period, (row) => Math.floor(row.n / 10), params);
  const nOnes = distributionForChannel(history, slot.period, (row) => row.n % 10, params);
  const mrTens = distributionForChannel(history, slot.period, (row) => Math.floor(row.mr / 10), params);
  const mrOnes = distributionForChannel(history, slot.period, (row) => row.mr % 10, params);

  const ranked = [];

  for (let nT = 0; nT < 10; nT += 1) {
    for (let nO = 0; nO < 10; nO += 1) {
      for (let mT = 0; mT < 10; mT += 1) {
        for (let mO = 0; mO < 10; mO += 1) {
          const n = nT * 10 + nO;
          const mr = mT * 10 + mO;
          const probability = nTens[nT] * nOnes[nO] * mrTens[mT] * mrOnes[mO];
          const revP = revProbability(history, slot.period, n, mr);

          ranked.push({
            dateISO: slot.dateISO,
            period: slot.period,
            n,
            mr,
            rev: revP >= 0.5 ? "R" : "-",
            revProbability: revP,
            probability,
          });
        }
      }
    }
  }

  ranked.sort((a, b) => b.probability - a.probability);
  const totalTop = ranked.slice(0, limit).reduce((sum, row) => sum + row.probability, 0);

  return ranked.slice(0, limit).map((row) => ({
    ...row,
    relativeShare: totalTop === 0 ? 0 : row.probability / totalTop,
  }));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const slotsArg = args.find((arg) => arg.startsWith("--slots="));
  const topArg = args.find((arg) => arg.startsWith("--top="));

  const top = topArg ? Number.parseInt(topArg.split("=")[1], 10) : 8;
  const slots = slotsArg
    ? slotsArg
        .split("=")[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => {
          const [dateISO, period] = value.split(":");
          return { dateISO, period };
        })
    : DEFAULT_SLOTS;

  return { slots, top };
}

function main() {
  const root = path.resolve(__dirname, "..", "..");
  const baseRows = parsePredictionCsv(path.join(root, "prediction.csv"), 2025);
  const supplementalRows = parsePredictionCsv(path.join(root, "newprediction.csv"), 2026);
  const officialRows = parsePredictionCsv(path.join(root, "newpredictionlist.csv"), 2026);
  const history = mergeRows(baseRows, supplementalRows, officialRows);
  const { params, score } = selectBestParams(history);
  const { slots, top } = parseArgs();

  const output = [];
  const workingHistory = [...history];

  for (const slot of slots) {
    const priorHistory = workingHistory.filter((row) => {
      if (row.dateISO !== slot.dateISO) {
        return row.dateISO < slot.dateISO;
      }
      return PERIOD_ORDER[row.period] < PERIOD_ORDER[slot.period];
    });

    const candidates = rankCandidates(priorHistory, slot, params, top);
    output.push({ slot, candidates });

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
  }

  console.log(
    JSON.stringify(
      {
        model: "Adaptive Monte Carlo digit-channel",
        selectedParams: params,
        backtestMeanDigitError: Number(score.toFixed(4)),
        slots: output,
      },
      null,
      2,
    ),
  );
}

main();

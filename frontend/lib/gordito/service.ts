import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { GorditoResponse } from "./types";
import { generateGorditoPredictions } from "./engine";

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function weekdayEs(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00");
  return WEEKDAYS_ES[d.getUTCDay()];
}

type LotteryCSVRow = { numero: number; serie: number };
type NTRRow = { n: number; mr: number };

function loadLotteryHistory(): LotteryCSVRow[] {
  const csvPath = process.env.LOTERIA_NACIONAL_CSV_PATH
    ?? path.resolve(process.cwd(), "../loteria-nacional.csv");
  if (!fs.existsSync(csvPath)) return [];

  const raw = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse<string[]>(raw, { header: false, skipEmptyLines: true });

  const rows: LotteryCSVRow[] = [];
  for (const line of parsed.data) {
    if (line.length < 3 || line[0] === "fecha") continue;
    const numero = parseInt(line[1], 10);
    const serie = parseInt(line[2], 10);
    if (!isNaN(numero) && !isNaN(serie)) rows.push({ numero, serie });
  }
  return rows;
}

function loadNTRHistory(): NTRRow[] {
  const rows: NTRRow[] = [];

  const loadCSV = (csvPath: string) => {
    if (!fs.existsSync(csvPath)) return;
    const raw = fs.readFileSync(csvPath, "utf-8");
    const lines = raw.split("\n");

    for (const line of lines) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 4) {
        const n = parseInt(parts[2], 10);
        const mr = parseInt(parts[4] ?? parts[3], 10);
        if (!isNaN(n) && !isNaN(mr) && n >= 0 && n <= 99 && mr >= 0 && mr <= 99) {
          rows.push({ n, mr });
        }
      }
    }
  };

  const predPath = process.env.PREDICTION_CSV_PATH ?? path.resolve(process.cwd(), "../prediction.csv");
  const newPredPath = process.env.NEW_PREDICTION_CSV_PATH ?? path.resolve(process.cwd(), "../newprediction.csv");

  loadCSV(predPath);
  loadCSV(newPredPath);

  return rows;
}

export function buildGorditoResponse(targetDate: string): GorditoResponse {
  const lotteryHistory = loadLotteryHistory();
  const ntrHistory = loadNTRHistory();

  const candidates = generateGorditoPredictions(targetDate, lotteryHistory, ntrHistory, 10);

  return {
    targetDate,
    sorteo: "Gordito del Medio Año",
    candidates,
    metadata: {
      model: "Ensemble Monte Carlo — Frequency/Markov/Cross-correlation/Gap/Fibonacci",
      historyRecords: lotteryHistory.length,
      crossCorrelationRecords: ntrHistory.length,
      methods: [
        "Frequency-Recency Decay",
        "1st & 2nd Order Markov Chains",
        "Cross-Lottery Correlation (NTR↔LN)",
        "Gap Pressure Analysis",
        "Fibonacci Lag Resonance",
        "Momentum Detection",
        "Date Numerology",
        "Multi-Temperature Sampling",
      ],
    },
  };
}

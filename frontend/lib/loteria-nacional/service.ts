import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { LoteriaNacionalRow, LoteriaNacionalResponse } from "./types";
import { generateLoteriaNacionalPrediction, LOTERIA_KABBALAH_MODEL } from "./kabbalah";

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function weekdayEs(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00");
  return WEEKDAYS_ES[d.getUTCDay()];
}

function loadHistoryCSV(): LoteriaNacionalRow[] {
  const csvPath = process.env.LOTERIA_NACIONAL_CSV_PATH
    ?? path.resolve(process.cwd(), "../loteria-nacional.csv");

  if (!fs.existsSync(csvPath)) return [];

  const raw = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse<string[]>(raw, { header: false, skipEmptyLines: true });

  const rows: LoteriaNacionalRow[] = [];
  for (const line of parsed.data) {
    if (line.length < 3) continue;
    const [fecha, numStr, serieStr] = line;
    if (!fecha || fecha === "fecha") continue; // skip header

    const numero = parseInt(numStr, 10);
    const serie = parseInt(serieStr, 10);
    if (isNaN(numero) || isNaN(serie)) continue;

    rows.push({
      dateISO: fecha.trim(),
      weekdayEs: weekdayEs(fecha.trim()),
      numero,
      serie,
      source: "csv",
    });
  }

  return rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

export function buildLoteriaNacionalResponse(targetDate: string): LoteriaNacionalResponse {
  const history = loadHistoryCSV();

  const prediction = generateLoteriaNacionalPrediction(
    targetDate,
    history.map((r) => ({ numero: r.numero, serie: r.serie })),
  );

  const predictionRow: LoteriaNacionalRow = {
    dateISO: targetDate,
    weekdayEs: weekdayEs(targetDate),
    numero: prediction.numero,
    serie: prediction.serie,
    source: "predicted",
  };

  return {
    targetDate,
    history,
    prediction: predictionRow,
    metadata: {
      model: LOTERIA_KABBALAH_MODEL,
      historyRecords: history.length,
    },
  };
}

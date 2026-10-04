import Papa from "papaparse";

import { type DrawPeriod, type HistoricalRow } from "../types";
import { normalizeSpanishWord, parseSpanishDateLabel, weekdayEsFromISO } from "../utils/date";

const PERIOD_MAP: Record<string, DrawPeriod> = {
  mediodia: "MEDIODIA",
  tarde: "TARDE",
  noche: "NOCHE",
};

function parsePeriod(raw: string | undefined): DrawPeriod | null {
  if (!raw) {
    return null;
  }

  return PERIOD_MAP[normalizeSpanishWord(raw)] ?? null;
}

function parseRev(value: string | undefined): "R" | "-" {
  return normalizeSpanishWord(value ?? "") === "r" ? "R" : "-";
}

function parseNumber(value: string | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    return null;
  }
  return n;
}

export type ParsePredictionCsvOptions = {
  defaultYear?: number;
};

export function parsePredictionCsv(
  csvText: string,
  options: ParsePredictionCsvOptions = {},
): HistoricalRow[] {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: false,
  });
  const defaultYear = options.defaultYear ?? 2025;

  let currentDateISO: string | null = null;
  let currentWeekday = "";
  let currentPeriod: DrawPeriod | null = null;

  const rows: HistoricalRow[] = [];

  for (const row of parsed.data) {
    const column2 = row[1]?.trim() ?? "";

    const maybeDate = parseSpanishDateLabel(column2, { defaultYear });
    if (maybeDate) {
      currentDateISO = maybeDate;
      currentWeekday = weekdayEsFromISO(maybeDate);
      currentPeriod = null;
      continue;
    }

    const maybePeriod = parsePeriod(column2);
    if (maybePeriod) {
      currentPeriod = maybePeriod;
      continue;
    }

    if (!currentDateISO || !currentPeriod) {
      continue;
    }

    const n = parseNumber(row[2]);
    const mr = parseNumber(row[4]);

    if (n == null || mr == null) {
      continue;
    }

    rows.push({
      dateISO: currentDateISO,
      weekdayEs: currentWeekday,
      period: currentPeriod,
      n,
      rev: parseRev(row[3]),
      mr,
    });
  }

  return rows;
}

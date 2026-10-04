import type { HistoricalRow } from "../types";

export function mergeHistoryRows(csvRows: HistoricalRow[], websiteRows: HistoricalRow[]): HistoricalRow[] {
  const byKey = new Map<string, HistoricalRow>();

  for (const row of csvRows) {
    byKey.set(`${row.dateISO}|${row.period}`, row);
  }

  for (const row of websiteRows) {
    byKey.set(`${row.dateISO}|${row.period}`, row);
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.dateISO !== b.dateISO) {
      return a.dateISO.localeCompare(b.dateISO);
    }
    return a.period.localeCompare(b.period);
  });
}

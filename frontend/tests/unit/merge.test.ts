import { describe, expect, it } from "vitest";

import { mergeHistoryRows } from "@/lib/history/merge";
import type { HistoricalRow } from "@/lib/types";

const csvRows: HistoricalRow[] = [
  {
    dateISO: "2026-02-18",
    weekdayEs: "miercoles",
    period: "MEDIODIA",
    n: 10,
    rev: "-",
    mr: 20,
  },
  {
    dateISO: "2026-02-18",
    weekdayEs: "miercoles",
    period: "TARDE",
    n: 30,
    rev: "R",
    mr: 40,
  },
];

const websiteRows: HistoricalRow[] = [
  {
    dateISO: "2026-02-18",
    weekdayEs: "miercoles",
    period: "MEDIODIA",
    n: 99,
    rev: "R",
    mr: 88,
  },
];

describe("mergeHistoryRows", () => {
  it("prefers website rows on duplicate date+period keys", () => {
    const merged = mergeHistoryRows(csvRows, websiteRows);

    expect(merged).toHaveLength(2);
    const mediodia = merged.find((row) => row.period === "MEDIODIA");

    expect(mediodia).toMatchObject({ n: 99, rev: "R", mr: 88 });
  });
});

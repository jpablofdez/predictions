import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parsePredictionCsv } from "@/lib/history/csv";

const csvPath = path.resolve(process.cwd(), "..", "prediction.csv");

describe("parsePredictionCsv", () => {
  it("parses the project CSV into normalized records", () => {
    const csvText = readFileSync(csvPath, "utf-8");
    const rows = parsePredictionCsv(csvText);

    expect(rows.length).toBeGreaterThan(130);
    expect(rows[0]).toMatchObject({
      dateISO: "2025-02-18",
      period: "MEDIODIA",
      n: 20,
      rev: "-",
      mr: 97,
    });

    for (const row of rows) {
      expect(row.n).toBeGreaterThanOrEqual(0);
      expect(row.n).toBeLessThanOrEqual(99);
      expect(row.mr).toBeGreaterThanOrEqual(0);
      expect(row.mr).toBeLessThanOrEqual(99);
      expect(["MEDIODIA", "TARDE", "NOCHE"]).toContain(row.period);
      expect(["R", "-"]).toContain(row.rev);
    }
  });
});

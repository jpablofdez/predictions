import { describe, expect, it } from "vitest";

import { generateKabbalahRows, KABBALAH_MODEL, KabbalahPredictionEngine } from "@/lib/prediction/kabbalah";
import { buildPredictionSlots } from "@/lib/utils/date";

const history = [
  {
    dateISO: "2026-03-28",
    weekdayEs: "sabado",
    period: "MEDIODIA" as const,
    n: 90,
    rev: "-" as const,
    mr: 89,
  },
  {
    dateISO: "2026-03-28",
    weekdayEs: "sabado",
    period: "TARDE" as const,
    n: 92,
    rev: "R" as const,
    mr: 80,
  },
  {
    dateISO: "2026-03-28",
    weekdayEs: "sabado",
    period: "NOCHE" as const,
    n: 95,
    rev: "-" as const,
    mr: 80,
  },
];

describe("generateKabbalahRows", () => {
  it("is deterministic and produces valid rows", async () => {
    const input = {
      from: "2026-03-29",
      to: "2026-03-29",
      slots: buildPredictionSlots("2026-03-29", "2026-03-29"),
      history,
    };

    const first = generateKabbalahRows(input);
    const second = generateKabbalahRows(input);
    const engine = new KabbalahPredictionEngine();
    const result = await engine.generate(input);

    expect(first).toEqual(second);
    expect(result.model).toBe(KABBALAH_MODEL);
    expect(first).toHaveLength(3);
    for (const row of first) {
      expect(row.n).toBeGreaterThanOrEqual(0);
      expect(row.n).toBeLessThanOrEqual(99);
      expect(row.mr).toBeGreaterThanOrEqual(0);
      expect(row.mr).toBeLessThanOrEqual(99);
      expect(["R", "-"]).toContain(row.rev);
    }
  });
});

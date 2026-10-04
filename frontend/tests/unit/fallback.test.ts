import { describe, expect, it } from "vitest";

import { generateFallbackRows } from "@/lib/prediction/fallback";
import { buildPredictionSlots } from "@/lib/utils/date";

describe("generateFallbackRows", () => {
  it("is deterministic and keeps values in valid ranges", () => {
    const slots = buildPredictionSlots("2026-02-19", "2026-02-20");
    const input = {
      from: "2026-02-19",
      to: "2026-02-20",
      slots,
      history: [
        {
          dateISO: "2026-02-18",
          weekdayEs: "miercoles",
          period: "NOCHE" as const,
          n: 12,
          rev: "R" as const,
          mr: 34,
        },
      ],
    };

    const first = generateFallbackRows(input);
    const second = generateFallbackRows(input);

    expect(first).toEqual(second);
    expect(first).toHaveLength(6);

    for (const row of first) {
      expect(row.source).toBe("fallback");
      expect(row.n).toBeGreaterThanOrEqual(0);
      expect(row.n).toBeLessThanOrEqual(99);
      expect(row.mr).toBeGreaterThanOrEqual(0);
      expect(row.mr).toBeLessThanOrEqual(99);
      expect(["R", "-"]).toContain(row.rev);
    }
  });

  it("keeps per-slot values stable regardless of requested range size", () => {
    const history = [
      {
        dateISO: "2026-02-18",
        weekdayEs: "miercoles",
        period: "NOCHE" as const,
        n: 12,
        rev: "R" as const,
        mr: 34,
      },
    ];

    const singleDay = generateFallbackRows({
      from: "2026-02-20",
      to: "2026-02-20",
      slots: buildPredictionSlots("2026-02-20", "2026-02-20"),
      history,
    });

    const multiDay = generateFallbackRows({
      from: "2026-02-19",
      to: "2026-02-20",
      slots: buildPredictionSlots("2026-02-19", "2026-02-20"),
      history,
    });

    const sameDateRows = multiDay.filter((row) => row.dateISO === "2026-02-20");
    expect(sameDateRows).toEqual(singleDay);
  });
});

import { describe, expect, it } from "vitest";

import { buildMonteCarloCandidates } from "@/lib/prediction/montecarlo";

const sampleHistory = [
  { dateISO: "2026-03-28", weekdayEs: "sabado", period: "MEDIODIA" as const, n: 90, rev: "-" as const, mr: 89 },
  { dateISO: "2026-03-28", weekdayEs: "sabado", period: "TARDE" as const, n: 92, rev: "R" as const, mr: 80 },
  { dateISO: "2026-03-28", weekdayEs: "sabado", period: "NOCHE" as const, n: 95, rev: "-" as const, mr: 80 },
  { dateISO: "2026-03-29", weekdayEs: "domingo", period: "MEDIODIA" as const, n: 14, rev: "-" as const, mr: 70 },
  { dateISO: "2026-03-29", weekdayEs: "domingo", period: "TARDE" as const, n: 97, rev: "-" as const, mr: 40 },
  { dateISO: "2026-03-29", weekdayEs: "domingo", period: "NOCHE" as const, n: 14, rev: "-" as const, mr: 44 },
  { dateISO: "2026-03-30", weekdayEs: "lunes", period: "MEDIODIA" as const, n: 45, rev: "-" as const, mr: 68 },
  { dateISO: "2026-03-30", weekdayEs: "lunes", period: "TARDE" as const, n: 11, rev: "-" as const, mr: 32 },
];

describe("buildMonteCarloCandidates", () => {
  it("is deterministic and returns ranked candidates per slot", () => {
    const input = {
      history: sampleHistory,
      slots: [
        { dateISO: "2026-03-30", period: "NOCHE" as const },
        { dateISO: "2026-03-31", period: "MEDIODIA" as const },
      ],
      top: 3,
    };

    const first = buildMonteCarloCandidates(input);
    const second = buildMonteCarloCandidates(input);

    expect(first).toEqual(second);
    expect(first.slots).toHaveLength(2);
    expect(first.slots[0].candidates).toHaveLength(3);
    expect(first.slots[0].candidates[0].probability).toBeGreaterThanOrEqual(first.slots[0].candidates[1].probability);
    expect(first.slots[1].candidates[0].dateISO).toBe("2026-03-31");
  });
});

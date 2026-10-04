import { describe, expect, it } from "vitest";

import { buildCandidateResponse, buildDefaultCandidateSlots, parseCandidateSlotsParam } from "@/lib/prediction/candidates";

const sampleCsv = `,"Domingo, 29 de marzo",,,
,MEDIODÍA,N°,Rev,MR
,,45,-,68
,TARDE,N°,Rev,MR
,,11,-,32
,NOCHE,N°,Rev,MR
,,93,R,80
`;

describe("candidate service helpers", () => {
  it("builds the default today-plus-tomorrow slot sequence", () => {
    expect(buildDefaultCandidateSlots("2026-03-30")).toEqual([
      { dateISO: "2026-03-30", period: "NOCHE" },
      { dateISO: "2026-03-31", period: "MEDIODIA" },
      { dateISO: "2026-03-31", period: "TARDE" },
      { dateISO: "2026-03-31", period: "NOCHE" },
    ]);
  });

  it("parses slot query params", () => {
    expect(parseCandidateSlotsParam("2026-03-30:NOCHE,2026-03-31:TARDE")).toEqual([
      { dateISO: "2026-03-30", period: "NOCHE" },
      { dateISO: "2026-03-31", period: "TARDE" },
    ]);
  });

  it("builds monte carlo candidates from merged history", async () => {
    const result = await buildCandidateResponse(
      {
        slots: [{ dateISO: "2026-03-30", period: "NOCHE" }],
        top: 2,
      },
      {
        csvText: sampleCsv,
        supplementalCsvText: null,
        predictionListCsvText: null,
        websiteHtml: null,
      },
    );

    expect(result.model).toBe("Adaptive Monte Carlo digit-channel");
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].candidates).toHaveLength(2);
  });
});

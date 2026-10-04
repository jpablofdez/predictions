import { describe, expect, it } from "vitest";

import { buildPredictionResponse } from "@/lib/prediction/service";
import type { PredictionEngine, PredictionInput, PredictionEngineResult } from "@/lib/types";

const sampleCsv = `,"Miércoles, 18 de Febrero",,,
,MEDIODÍA,N°,Rev,MR
,,20,-,97
,TARDE,N°,Rev,MR
,,12,R,41
,NOCHE,N°,Rev,MR
,,12,R,94
`;

class SuccessEngine implements PredictionEngine {
  async generate(input: PredictionInput): Promise<PredictionEngineResult> {
    const rows = input.slots.map((slot) => ({
      dateISO: slot.dateISO,
      weekdayEs: slot.weekdayEs,
      period: slot.period,
      n: 1,
      rev: "-" as const,
      mr: 2,
      source: "llm" as const,
    }));

    return {
      rows,
      model: "mock-model",
    };
  }
}

describe("buildPredictionResponse llm path", () => {
  it("returns llm metadata when llm engine succeeds", async () => {
    const result = await buildPredictionResponse(
      { from: "2026-02-19", to: "2026-02-19" },
      {
        csvText: sampleCsv,
        supplementalCsvText: null,
        websiteHtml: null,
        llmEngine: new SuccessEngine(),
      },
    );

    expect(result.rows).toHaveLength(3);
    expect(result.metadata.usedLLM).toBe(true);
    expect(result.metadata.model).toBe("mock-model");
    expect(result.rows.every((row) => row.source === "llm")).toBe(true);
  });
});

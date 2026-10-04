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

class ThrowingEngine implements PredictionEngine {
  async generate(input: PredictionInput): Promise<PredictionEngineResult> {
    void input;
    throw new Error("forced failure");
  }
}

describe("buildPredictionResponse", () => {
  it("returns full range in fallback mode when llm fails", async () => {
    const result = await buildPredictionResponse(
      { from: "2026-02-19", to: "2026-03-31" },
      {
        csvText: sampleCsv,
        supplementalCsvText: null,
        websiteHtml: null,
        llmEngine: new ThrowingEngine(),
      },
    );

    expect(result.rows).toHaveLength(123);
    expect(result.metadata.usedLLM).toBe(false);
    expect(result.metadata.model).toBe("Adaptive Monte Carlo digit-channel");
    expect(result.metadata.websiteMerged).toBe(false);

    expect(result.rows[0]).toMatchObject({
      dateISO: "2026-02-19",
      period: "MEDIODIA",
      source: "fallback",
    });

    expect(result.rows[122]).toMatchObject({
      dateISO: "2026-03-31",
      period: "NOCHE",
    });
  });
});

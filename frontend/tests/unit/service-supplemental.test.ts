import { describe, expect, it } from "vitest";

import { buildPredictionResponse } from "@/lib/prediction/service";

const baseCsv = `,"Miércoles, 18 de Febrero",,,
,MEDIODÍA,N°,Rev,MR
,,20,-,97
,TARDE,N°,Rev,MR
,,12,R,41
,NOCHE,N°,Rev,MR
,,12,R,94
`;

const supplementalCsv = `,"Jueves, 19 de Febrero",,,
,MEDIODÍA,N°,Rev,MR
,,53,R,45
,TARDE,N°,Rev,MR
,,20,R,94
,NOCHE,N°,Rev,MR
,,41,R,94
`;

describe("buildPredictionResponse supplemental anchors", () => {
  it("overrides generated rows with supplemental known outcomes when keys match", async () => {
    const result = await buildPredictionResponse(
      { from: "2026-02-19", to: "2026-02-19" },
      {
        csvText: baseCsv,
        supplementalCsvText: supplementalCsv,
        websiteHtml: null,
        llmEngine: null,
      },
    );

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({ period: "MEDIODIA", n: 53, rev: "R", mr: 45 });
    expect(result.rows[1]).toMatchObject({ period: "TARDE", n: 20, rev: "R", mr: 94 });
    expect(result.rows[2]).toMatchObject({ period: "NOCHE", n: 41, rev: "R", mr: 94 });
  });

  it("anchors partial known results while generating the rest", async () => {
    const partialSupplementalCsv = `,"Viernes, 27 de Febrero",,,
,MEDIODÍA,N°,Rev,MR
,,18,R,76
`;

    const result = await buildPredictionResponse(
      { from: "2026-02-27", to: "2026-02-27" },
      {
        csvText: baseCsv,
        supplementalCsvText: partialSupplementalCsv,
        websiteHtml: null,
        llmEngine: null,
      },
    );

    expect(result.rows).toHaveLength(3);
    const mediodia = result.rows.find((row) => row.period === "MEDIODIA");
    expect(mediodia).toMatchObject({ n: 18, rev: "R", mr: 76 });
  });
});

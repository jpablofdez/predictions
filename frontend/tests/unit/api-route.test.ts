import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/predictions/route";
import { buildPredictionResponse } from "@/lib/prediction/service";
import { currentDateISOInTimeZone, DEFAULT_PREDICTION_FROM_ISO } from "@/lib/utils/date";

vi.mock("@/lib/prediction/service", () => ({
  buildPredictionResponse: vi.fn(),
}));

const mockedBuildPredictionResponse = vi.mocked(buildPredictionResponse);

describe("GET /api/predictions", () => {
  beforeEach(() => {
    mockedBuildPredictionResponse.mockReset();
  });

  it("returns successful JSON response", async () => {
    mockedBuildPredictionResponse.mockResolvedValue({
      from: "2026-02-19",
      to: "2026-03-31",
      rows: [],
      metadata: {
        usedLLM: false,
        historyRecords: 0,
        websiteMerged: false,
      },
    });

    const request = new NextRequest(
      "http://localhost:3000/api/predictions?from=2026-02-19&to=2026-03-31",
    );

    const response = await GET(request);
    const body = (await response.json()) as { from: string };

    expect(response.status).toBe(200);
    expect(body.from).toBe("2026-02-19");
  });

  it("uses the Costa Rica current date when query params are omitted", async () => {
    mockedBuildPredictionResponse.mockResolvedValue({
      from: DEFAULT_PREDICTION_FROM_ISO,
      to: currentDateISOInTimeZone(),
      rows: [],
      metadata: {
        usedLLM: false,
        historyRecords: 0,
        websiteMerged: false,
      },
    });

    const request = new NextRequest("http://localhost:3000/api/predictions");

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockedBuildPredictionResponse).toHaveBeenCalledWith({
      from: DEFAULT_PREDICTION_FROM_ISO,
      to: currentDateISOInTimeZone(),
    });
  });

  it("returns error JSON on service failure", async () => {
    mockedBuildPredictionResponse.mockRejectedValue(new Error("broken"));

    const request = new NextRequest("http://localhost:3000/api/predictions");
    const response = await GET(request);
    const body = (await response.json()) as { details: string };

    expect(response.status).toBe(500);
    expect(body.details).toContain("broken");
  });
});

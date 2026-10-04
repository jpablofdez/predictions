import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/candidates/route";
import { buildCandidateResponse } from "@/lib/prediction/candidates";

vi.mock("@/lib/prediction/candidates", () => ({
  buildCandidateResponse: vi.fn(),
  parseCandidateSlotsParam: vi.fn((value: string | null) =>
    value
      ? value.split(",").map((entry) => {
          const [dateISO, period] = entry.split(":");
          return { dateISO, period };
        })
      : [{ dateISO: "2026-03-30", period: "NOCHE" }],
  ),
}));

const mockedBuildCandidateResponse = vi.mocked(buildCandidateResponse);

describe("GET /api/candidates", () => {
  beforeEach(() => {
    mockedBuildCandidateResponse.mockReset();
  });

  it("returns successful JSON response", async () => {
    mockedBuildCandidateResponse.mockResolvedValue({
      model: "Adaptive Monte Carlo digit-channel",
      selectedParams: {
        name: "transition",
        histDecay: 20,
        transDecay: 8,
        periodFreqW: 0.7,
        globalFreqW: 0.35,
        periodTransW: 1.45,
        globalTransW: 0.6,
        gapW: 0.28,
        momentumW: 0.18,
        temperature: 0.84,
      },
      backtestMeanDigitError: 6,
      slots: [],
    });

    const request = new NextRequest(
      "http://localhost:3000/api/candidates?slots=2026-03-30:NOCHE,2026-03-31:MEDIODIA&top=3",
    );

    const response = await GET(request);
    const body = (await response.json()) as { model: string };

    expect(response.status).toBe(200);
    expect(body.model).toBe("Adaptive Monte Carlo digit-channel");
    expect(mockedBuildCandidateResponse).toHaveBeenCalledWith({
      slots: [
        { dateISO: "2026-03-30", period: "NOCHE" },
        { dateISO: "2026-03-31", period: "MEDIODIA" },
      ],
      top: 3,
    });
  });

  it("returns error JSON on service failure", async () => {
    mockedBuildCandidateResponse.mockRejectedValue(new Error("bad candidates"));

    const request = new NextRequest("http://localhost:3000/api/candidates");
    const response = await GET(request);
    const body = (await response.json()) as { details: string };

    expect(response.status).toBe(500);
    expect(body.details).toContain("bad candidates");
  });
});

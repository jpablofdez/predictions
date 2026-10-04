import { NextRequest, NextResponse } from "next/server";

import { type PredictionEngineType, buildPredictionResponse } from "@/lib/prediction/service";
import { currentDateISOInTimeZone, DEFAULT_PREDICTION_FROM_ISO } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? DEFAULT_PREDICTION_FROM_ISO;
  const to = request.nextUrl.searchParams.get("to") ?? currentDateISOInTimeZone();
  const engine = request.nextUrl.searchParams.get("engine") as PredictionEngineType | null;

  try {
    const data = await buildPredictionResponse({ from, to, engine: engine ?? undefined });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to generate predictions",
        details: message,
      },
      { status: 500 },
    );
  }
}

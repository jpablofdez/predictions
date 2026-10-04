import { NextRequest, NextResponse } from "next/server";

import { buildCandidateResponse, parseCandidateSlotsParam } from "@/lib/prediction/candidates";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const slots = parseCandidateSlotsParam(request.nextUrl.searchParams.get("slots"));
    const rawTop = request.nextUrl.searchParams.get("top");
    const top = rawTop ? Number.parseInt(rawTop, 10) : 6;

    const data = await buildCandidateResponse({ slots, top });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to generate candidate predictions",
        details: message,
      },
      { status: 500 },
    );
  }
}

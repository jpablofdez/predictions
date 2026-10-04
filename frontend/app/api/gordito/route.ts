import { NextRequest, NextResponse } from "next/server";
import { buildGorditoResponse } from "@/lib/gordito/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get("date") ?? "2026-07-05";

    const result = buildGorditoResponse(targetDate);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";

import { getEnvironmentalFactors } from "@/lib/environment/factors";
import type { DrawPeriod } from "@/lib/types";

const VALID_PERIODS: DrawPeriod[] = ["MEDIODIA", "TARDE", "NOCHE"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date");
  const period = searchParams.get("period") as DrawPeriod | null;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid 'date' parameter (expected YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const targetPeriod = period && VALID_PERIODS.includes(period) ? period : "MEDIODIA";

  if (period && !VALID_PERIODS.includes(period)) {
    return NextResponse.json(
      { error: `Invalid 'period' parameter. Valid values: ${VALID_PERIODS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const factors = await getEnvironmentalFactors(date, targetPeriod);
    return NextResponse.json({
      date,
      period: targetPeriod,
      factors,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch environmental factors", details: String(error) },
      { status: 500 },
    );
  }
}

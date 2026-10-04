import { NextResponse } from "next/server";

import { generateCNNStrategy } from "@/lib/prediction/cnn";
import { loadMergedHistory } from "@/lib/prediction/service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateISO = searchParams.get("date") ?? "2026-05-02";
    const budget = Number(searchParams.get("budget") ?? "5000");

    if (Number.isNaN(budget) || budget <= 0) {
      return NextResponse.json({ error: "Invalid budget" }, { status: 400 });
    }

    const { mergedHistory } = await loadMergedHistory();
    const strategy = generateCNNStrategy(mergedHistory, dateISO, budget);

    return NextResponse.json(strategy);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import OpenAI from "openai";

import type { PredictionEngine, PredictionEngineResult, PredictionInput, PredictionRow } from "../types";

type LLMRow = {
  dateISO: string;
  period: PredictionRow["period"];
  n: number;
  rev: PredictionRow["rev"];
  mr: number;
};

function extractJsonObject(content: string): string {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM response was not valid JSON");
  }
  return content.slice(start, end + 1);
}

function validateNumber(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 99) {
    throw new Error("LLM produced out-of-range numeric field");
  }
  return value as number;
}

function normalizeRows(input: PredictionInput, rows: LLMRow[]): PredictionRow[] {
  const byKey = new Map<string, LLMRow>();

  for (const row of rows) {
    byKey.set(`${row.dateISO}|${row.period}`, row);
  }

  return input.slots.map((slot) => {
    const key = `${slot.dateISO}|${slot.period}`;
    const row = byKey.get(key);
    if (!row) {
      throw new Error(`LLM response missing row for ${key}`);
    }

    const rev = row.rev === "R" ? "R" : "-";

    return {
      dateISO: slot.dateISO,
      weekdayEs: slot.weekdayEs,
      period: slot.period,
      n: validateNumber(row.n),
      rev,
      mr: validateNumber(row.mr),
      source: "llm",
    };
  });
}

export class LLMPredictionEngine implements PredictionEngine {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(input: PredictionInput): Promise<PredictionEngineResult> {
    const slotsPayload = input.slots.map((slot) => ({
      dateISO: slot.dateISO,
      period: slot.period,
    }));

    const historySample = input.history.slice(-90).map((row) => ({
      dateISO: row.dateISO,
      period: row.period,
      n: row.n,
      rev: row.rev,
      mr: row.mr,
    }));

    const prompt = {
      modelFramework: "Bubbling flows fractal",
      objective:
        "Generate lottery-style prediction rows using a fractal, multi-scale digit model while preserving chronological row order.",
      constraints: {
        rowCount: input.slots.length,
        nAndMrRange: "0..99",
        revAllowed: ["R", "-"],
        independenceRule:
          "Treat each row and each numeric field (n, mr) as individual outputs from a pressurized-air console; do not create trend/sequence dependencies.",
        closenessRule:
          "Choose each digit (tens and ones) to be as close as possible to the most recent observed digits for the same period while staying realistic.",
        fractalRule:
          "Use long-history multi-scale patterns (lags 1,2,3,5,8,13,21,34+) for each period and each digit channel (N tens/ones, MR tens/ones).",
        hyperparameters: {
          recencyDecay: 55,
          transitionDecay: 34,
          fractalWeight: 1.45,
          transitionWeight: 1.2,
          globalMix: 0.58,
        },
        outputJsonOnly: true,
      },
      requestedRows: slotsPayload,
      historySample,
      outputSchema: {
        rows: [
          {
            dateISO: "YYYY-MM-DD",
            period: "MEDIODIA|TARDE|NOCHE",
            n: 0,
            rev: "R|-",
            mr: 0,
          },
        ],
      },
    };

    const response = await this.client.responses.create({
      model: this.model,
      temperature: 0.2,
      max_output_tokens: 8000,
      input: [
        {
          role: "system",
          content:
            "You are a precise prediction generator. Return only valid JSON and no markdown fences or extra commentary.",
        },
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
    });

    const rawText = response.output_text?.trim();
    if (!rawText) {
      throw new Error("Empty LLM response");
    }

    const parsed = JSON.parse(extractJsonObject(rawText)) as { rows?: LLMRow[] };
    if (!parsed.rows || !Array.isArray(parsed.rows)) {
      throw new Error("LLM response missing rows array");
    }

    return {
      rows: normalizeRows(input, parsed.rows),
      model: this.model,
    };
  }
}

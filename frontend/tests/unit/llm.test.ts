import { describe, expect, it, vi, beforeEach } from "vitest";

import type { PredictionInput } from "@/lib/types";
import { buildPredictionSlots } from "@/lib/utils/date";
import { LLMPredictionEngine } from "@/lib/prediction/llm";

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    responses = { create: createMock };
  },
}));

function makeInput(): PredictionInput {
  const slots = buildPredictionSlots("2026-02-19", "2026-02-19");
  return {
    from: "2026-02-19",
    to: "2026-02-19",
    slots,
    history: [],
  };
}

describe("LLMPredictionEngine", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("normalizes valid JSON output from model", async () => {
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        rows: [
          { dateISO: "2026-02-19", period: "MEDIODIA", n: 11, rev: "R", mr: 22 },
          { dateISO: "2026-02-19", period: "TARDE", n: 33, rev: "-", mr: 44 },
          { dateISO: "2026-02-19", period: "NOCHE", n: 55, rev: "R", mr: 66 },
        ],
      }),
    });

    const engine = new LLMPredictionEngine("test-key", "gpt-test");
    const result = await engine.generate(makeInput());

    expect(result.model).toBe("gpt-test");
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({ source: "llm", n: 11, rev: "R", mr: 22 });
  });

  it("throws if one requested row is missing", async () => {
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        rows: [
          { dateISO: "2026-02-19", period: "MEDIODIA", n: 11, rev: "R", mr: 22 },
          { dateISO: "2026-02-19", period: "TARDE", n: 33, rev: "-", mr: 44 },
        ],
      }),
    });

    const engine = new LLMPredictionEngine("test-key", "gpt-test");

    await expect(engine.generate(makeInput())).rejects.toThrow("missing row");
  });
});

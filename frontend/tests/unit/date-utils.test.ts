import { describe, expect, it } from "vitest";

import {
  addDaysToISO,
  buildPredictionSlots,
  COSTA_RICA_TIME_ZONE,
  currentDateISOInTimeZone,
  parseSpanishDateLabel,
} from "@/lib/utils/date";

describe("buildPredictionSlots", () => {
  it("builds the full inclusive date range with 3 periods per day", () => {
    const slots = buildPredictionSlots("2026-02-19", "2026-03-31");

    expect(slots).toHaveLength(123);
    expect(slots[0]).toMatchObject({
      dateISO: "2026-02-19",
      period: "MEDIODIA",
      weekdayEs: "jueves",
    });

    expect(slots[1].period).toBe("TARDE");
    expect(slots[2].period).toBe("NOCHE");

    expect(slots[120]).toMatchObject({ dateISO: "2026-03-31", period: "MEDIODIA" });
    expect(slots[122]).toMatchObject({ dateISO: "2026-03-31", period: "NOCHE" });
  });

  it("throws on descending date ranges", () => {
    expect(() => buildPredictionSlots("2026-03-31", "2026-02-19")).toThrow("ascending");
  });
});

describe("parseSpanishDateLabel", () => {
  it("parses accented and non-accented weekday labels", () => {
    expect(parseSpanishDateLabel("Miércoles, 18 de Febrero", { defaultYear: 2026 })).toBe(
      "2026-02-18",
    );
    expect(parseSpanishDateLabel("Sabado, 7 de Febrero", { defaultYear: 2026 })).toBe(
      "2026-02-07",
    );
  });

  it("returns null for unknown month names", () => {
    expect(parseSpanishDateLabel("Lunes, 3 de Foo", { defaultYear: 2026 })).toBeNull();
  });
});

describe("currentDateISOInTimeZone", () => {
  it("uses Costa Rica calendar date instead of the local machine timezone", () => {
    expect(
      currentDateISOInTimeZone(COSTA_RICA_TIME_ZONE, new Date("2026-03-30T05:30:00.000Z")),
    ).toBe("2026-03-29");
  });
});

describe("addDaysToISO", () => {
  it("adds days while preserving ISO formatting", () => {
    expect(addDaysToISO("2026-03-30", 1)).toBe("2026-03-31");
  });
});

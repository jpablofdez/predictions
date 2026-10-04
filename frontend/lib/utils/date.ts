import { addDays, format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { DRAW_PERIODS, type DrawPeriod, type PredictionSlot } from "../types";

export const COSTA_RICA_TIME_ZONE = "America/Costa_Rica";
export const DEFAULT_PREDICTION_FROM_ISO = "2026-02-19";

const MONTH_MAP: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const WEEKDAY_MAP: Record<string, string> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miercoles",
  thursday: "jueves",
  friday: "viernes",
  saturday: "sabado",
  sunday: "domingo",
};

export function normalizeSpanishWord(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function weekdayEsFromISO(dateISO: string): string {
  const date = parseISO(dateISO);
  if (!isValid(date)) {
    throw new Error(`Invalid ISO date: ${dateISO}`);
  }

  const english = format(date, "EEEE").toLowerCase();
  const mapped = WEEKDAY_MAP[english];
  if (!mapped) {
    throw new Error(`Unknown weekday for ${dateISO}`);
  }

  return mapped;
}

export function currentDateISOInTimeZone(
  timeZone = COSTA_RICA_TIME_ZONE,
  referenceDate = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to determine current date for time zone: ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

export function addDaysToISO(dateISO: string, amount: number): string {
  const date = parseISO(dateISO);
  if (!isValid(date)) {
    throw new Error(`Invalid ISO date: ${dateISO}`);
  }

  return format(addDays(date, amount), "yyyy-MM-dd");
}

export function buildPredictionSlots(fromISO: string, toISO: string): PredictionSlot[] {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);

  if (!isValid(from) || !isValid(to)) {
    throw new Error("Invalid date range");
  }
  if (from > to) {
    throw new Error("Date range must be ascending");
  }

  const slots: PredictionSlot[] = [];
  let cursor = from;
  let index = 0;

  while (cursor <= to) {
    const dateISO = format(cursor, "yyyy-MM-dd");
    const weekdayEs = weekdayEsFromISO(dateISO);

    for (const period of DRAW_PERIODS) {
      slots.push({
        dateISO,
        weekdayEs,
        period: period as DrawPeriod,
        index,
      });
      index += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return slots;
}

export function parseSpanishDateLabel(
  rawLabel: string,
  opts?: { defaultYear?: number },
): string | null {
  const trimmed = rawLabel.trim().replace(/^"|"$/g, "");
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(
    /(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo),?\s*(\d{1,2})\s+de\s+([a-záéíóú]+)/i,
  );

  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[2], 10);
  const monthName = normalizeSpanishWord(match[3]);
  const month = MONTH_MAP[monthName];
  const year = opts?.defaultYear ?? 2025;

  if (!month || !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = parseISO(iso);

  if (!isValid(parsed)) {
    return null;
  }

  return iso;
}

export function formatDateEs(dateISO: string): string {
  const date = parseISO(dateISO);
  if (!isValid(date)) {
    return dateISO;
  }
  return format(date, "d 'de' MMMM yyyy", { locale: es });
}

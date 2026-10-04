import { load } from "cheerio";

import { type DrawPeriod, type HistoricalRow } from "../types";
import { normalizeSpanishWord, parseSpanishDateLabel, weekdayEsFromISO } from "../utils/date";

const PERIOD_ALIASES: Array<{ pattern: RegExp; period: DrawPeriod }> = [
  { pattern: /mediodia|medio\s*dia|mediodía/i, period: "MEDIODIA" },
  { pattern: /tarde/i, period: "TARDE" },
  { pattern: /noche/i, period: "NOCHE" },
];

function detectPeriod(value: string): DrawPeriod | null {
  for (const alias of PERIOD_ALIASES) {
    if (alias.pattern.test(value)) {
      return alias.period;
    }
  }
  return null;
}

function extractDraw(value: string): { n: number; rev: "R" | "-"; mr: number } | null {
  const compact = value.replace(/\s+/g, " ").trim();

  const strict = compact.match(/(\d{1,2})\s*(R|-)\s*(\d{1,2})/i);
  if (strict) {
    return {
      n: Number.parseInt(strict[1], 10),
      rev: strict[2].toUpperCase() === "R" ? "R" : "-",
      mr: Number.parseInt(strict[3], 10),
    };
  }

  const fallback = compact.match(/\b(\d{1,2})\b.*\b(\d{1,2})\b/);
  if (!fallback) {
    return null;
  }

  const rev = /\bR\b/i.test(compact) ? "R" : "-";
  return {
    n: Number.parseInt(fallback[1], 10),
    rev,
    mr: Number.parseInt(fallback[2], 10),
  };
}

function uniqueRows(rows: HistoricalRow[]): HistoricalRow[] {
  const map = new Map<string, HistoricalRow>();
  for (const row of rows) {
    map.set(`${row.dateISO}|${row.period}`, row);
  }
  return [...map.values()];
}

export function parseWebsitePredictionHtml(html: string, defaultYear = 2026): HistoricalRow[] {
  if (!html || html.includes("Just a moment") || html.includes("Enable JavaScript and cookies")) {
    return [];
  }

  const $ = load(html);
  const rows: HistoricalRow[] = [];

  let currentDateISO: string | null = null;
  let currentWeekday = "";

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (cells.length === 0) {
      return;
    }

    const joined = cells.join(" ");

    const parsedDate = parseSpanishDateLabel(joined, { defaultYear });
    if (parsedDate) {
      currentDateISO = parsedDate;
      currentWeekday = weekdayEsFromISO(parsedDate);
    }

    const period = detectPeriod(joined);
    const parsedDraw = extractDraw(joined);

    if (currentDateISO && period && parsedDraw) {
      rows.push({
        dateISO: currentDateISO,
        weekdayEs: currentWeekday,
        period,
        ...parsedDraw,
      });
    }
  });

  if (rows.length > 0) {
    return uniqueRows(rows);
  }

  const textLines = $("body")
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  currentDateISO = null;
  currentWeekday = "";
  let pendingPeriod: DrawPeriod | null = null;

  for (const line of textLines) {
    const parsedDate = parseSpanishDateLabel(line, { defaultYear });
    if (parsedDate) {
      currentDateISO = parsedDate;
      currentWeekday = weekdayEsFromISO(parsedDate);
      pendingPeriod = null;
      continue;
    }

    const foundPeriod = detectPeriod(normalizeSpanishWord(line));
    if (foundPeriod) {
      pendingPeriod = foundPeriod;
    }

    if (!currentDateISO || !pendingPeriod) {
      continue;
    }

    const draw = extractDraw(line);
    if (!draw) {
      continue;
    }

    rows.push({
      dateISO: currentDateISO,
      weekdayEs: currentWeekday,
      period: pendingPeriod,
      ...draw,
    });
    pendingPeriod = null;
  }

  return uniqueRows(rows);
}

export async function fetchWebsitePredictionHtml(url: string, timeoutMs = 6000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PredictionMVP/1.0)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

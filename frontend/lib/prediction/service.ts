import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { parsePredictionCsv } from "../history/csv";
import { mergeHistoryRows } from "../history/merge";
import { fetchWebsitePredictionHtml, parseWebsitePredictionHtml } from "../history/website";
import type { HistoricalRow, PredictionEngine, PredictionInput, PredictionResponse, PredictionRow } from "../types";
import { buildPredictionSlots } from "../utils/date";
import { EnvironmentalPredictionEngine } from "./environmental";
import { LLMPredictionEngine } from "./llm";
import { MonteCarloPredictionEngine } from "./montecarlo";

const DEFAULT_SOURCE_URL = "https://www.jps.go.cr/resultados/nuevos-tiempos-reventados";

export type PredictionEngineType = "montecarlo" | "environmental";

export type BuildPredictionResponseParams = {
  from: string;
  to: string;
  engine?: PredictionEngineType;
};

export type PredictionServiceDeps = {
  csvText?: string;
  supplementalCsvText?: string | null;
  supplementalDefaultYear?: number;
  predictionListCsvText?: string | null;
  predictionListDefaultYear?: number;
  websiteHtml?: string | null;
  disableWebsite?: boolean;
  websiteUrl?: string;
  llmEngine?: PredictionEngine | null;
  fallbackEngine?: PredictionEngine;
};

function resolvePrimaryCsvPath(): string {
  const explicit = process.env.PREDICTION_CSV_PATH;
  return explicit ? path.resolve(explicit) : path.resolve(process.cwd(), "..", "prediction.csv");
}

function resolveSupplementalCsvPath(): string {
  const explicit = process.env.NEW_PREDICTION_CSV_PATH;
  return explicit ? path.resolve(explicit) : path.resolve(process.cwd(), "..", "newprediction.csv");
}

function resolvePredictionListCsvPath(): string {
  const explicit = process.env.NEW_PREDICTION_LIST_CSV_PATH;
  return explicit ? path.resolve(explicit) : path.resolve(process.cwd(), "..", "newpredictionlist.csv");
}

async function readRequiredCsv(csvPath: string): Promise<string> {
  return readFile(csvPath, "utf-8");
}

async function readOptionalCsv(csvPath: string): Promise<string | null> {
  try {
    await access(csvPath);
    return await readFile(csvPath, "utf-8");
  } catch {
    return null;
  }
}

function mergeTwoHistorySets(first: HistoricalRow[], second: HistoricalRow[]): HistoricalRow[] {
  return mergeHistoryRows(first, second);
}

async function loadWebsiteRows(deps: PredictionServiceDeps): Promise<HistoricalRow[]> {
  if (deps.disableWebsite) {
    return [];
  }

  const html =
    deps.websiteHtml !== undefined
      ? deps.websiteHtml
      : await fetchWebsitePredictionHtml(deps.websiteUrl ?? DEFAULT_SOURCE_URL);

  if (!html) {
    return [];
  }

  return parseWebsitePredictionHtml(html);
}

async function selectLLMEngine(deps: PredictionServiceDeps): Promise<PredictionEngine | null> {
  if (deps.llmEngine !== undefined) {
    return deps.llmEngine;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return null;
  }

  return new LLMPredictionEngine(key);
}

export async function loadMergedHistory(
  deps: PredictionServiceDeps = {},
): Promise<{
  csvRows: HistoricalRow[];
  supplementalRows: HistoricalRow[];
  predictionListRows: HistoricalRow[];
  websiteRows: HistoricalRow[];
  mergedHistory: HistoricalRow[];
}> {
  const csvText = deps.csvText ?? (await readRequiredCsv(resolvePrimaryCsvPath()));
  const csvRows = parsePredictionCsv(csvText, { defaultYear: 2025 });

  const supplementalCsvText =
    deps.supplementalCsvText !== undefined
      ? deps.supplementalCsvText
      : await readOptionalCsv(resolveSupplementalCsvPath());

  const supplementalRows = supplementalCsvText
    ? parsePredictionCsv(supplementalCsvText, { defaultYear: deps.supplementalDefaultYear ?? 2026 })
    : [];

  const predictionListCsvText =
    deps.predictionListCsvText !== undefined
      ? deps.predictionListCsvText
      : deps.supplementalCsvText !== undefined
        ? null
        : await readOptionalCsv(resolvePredictionListCsvPath());

  const predictionListRows = predictionListCsvText
    ? parsePredictionCsv(predictionListCsvText, { defaultYear: deps.predictionListDefaultYear ?? 2026 })
    : [];

  const websiteRows = await loadWebsiteRows(deps);
  const mergedHistory = mergeTwoHistorySets(
    mergeTwoHistorySets(mergeTwoHistorySets(csvRows, supplementalRows), predictionListRows),
    websiteRows,
  );

  return {
    csvRows,
    supplementalRows,
    predictionListRows,
    websiteRows,
    mergedHistory,
  };
}

export async function buildPredictionResponse(
  params: BuildPredictionResponseParams,
  deps: PredictionServiceDeps = {},
): Promise<PredictionResponse> {
  const { mergedHistory, supplementalRows, predictionListRows, websiteRows } = await loadMergedHistory(deps);

  const allSlots = buildPredictionSlots(params.from, params.to);

  // Build a map of historical data keyed by dateISO|period
  const historyByKey = new Map<string, HistoricalRow>();
  for (const row of mergedHistory) {
    historyByKey.set(`${row.dateISO}|${row.period}`, row);
  }

  // Separate slots into covered (have historical data) and uncovered (need prediction)
  const coveredRows: PredictionRow[] = [];
  const uncoveredSlots = [];
  for (const slot of allSlots) {
    const key = `${slot.dateISO}|${slot.period}`;
    const hist = historyByKey.get(key);
    if (hist) {
      // Determine source: supplemental CSV wins, then website, then csv
      const suppKey = `${hist.dateISO}|${hist.period}`;
      const isSupplemental =
        supplementalRows.some((r) => `${r.dateISO}|${r.period}` === suppKey) ||
        predictionListRows.some((r) => `${r.dateISO}|${r.period}` === suppKey);
      const isWebsite = websiteRows.some((r) => `${r.dateISO}|${r.period}` === suppKey);
      const source = isWebsite ? "website" : isSupplemental ? "supplemental" : "csv";

      coveredRows.push({
        dateISO: hist.dateISO,
        weekdayEs: hist.weekdayEs,
        period: hist.period,
        n: hist.n,
        rev: hist.rev,
        mr: hist.mr,
        source,
      });
    } else {
      uncoveredSlots.push(slot);
    }
  }

  let predictedRows: PredictionRow[] = [];
  let usedLLM = false;
  let model: string | undefined;

  if (uncoveredSlots.length > 0) {
    const input: PredictionInput = {
      from: params.from,
      to: params.to,
      slots: uncoveredSlots,
      history: mergedHistory,
    };

    const useEnvironmental = params.engine === "environmental" || process.env.PREDICTION_ENGINE === "environmental";
    const fallbackEngine = deps.fallbackEngine ?? (useEnvironmental ? new EnvironmentalPredictionEngine() : new MonteCarloPredictionEngine());
    const llmEngine = await selectLLMEngine(deps);

    if (llmEngine) {
      try {
        const llmResult = await llmEngine.generate(input);
        predictedRows = llmResult.rows;
        model = llmResult.model;
        usedLLM = true;
      } catch {
        const fallbackResult = await fallbackEngine.generate(input);
        predictedRows = fallbackResult.rows;
        model = fallbackResult.model;
      }
    } else {
      const fallbackResult = await fallbackEngine.generate(input);
      predictedRows = fallbackResult.rows;
      model = fallbackResult.model;
    }

    if (predictedRows.length !== uncoveredSlots.length) {
      throw new Error(`Prediction output mismatch: expected ${uncoveredSlots.length} rows, got ${predictedRows.length}`);
    }
  }

  // Combine covered + predicted, sorted by date then period
  const periodOrder = { MEDIODIA: 0, TARDE: 1, NOCHE: 2 };
  const allRows = [...coveredRows, ...predictedRows].sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
    return (periodOrder[a.period] ?? 0) - (periodOrder[b.period] ?? 0);
  });

  return {
    from: params.from,
    to: params.to,
    rows: allRows,
    metadata: {
      usedLLM,
      model,
      historyRecords: mergedHistory.length,
      websiteMerged: websiteRows.length > 0,
    },
  };
}

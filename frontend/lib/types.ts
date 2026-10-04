export const DRAW_PERIODS = ["MEDIODIA", "TARDE", "NOCHE"] as const;

export type DrawPeriod = (typeof DRAW_PERIODS)[number];
export type RevFlag = "R" | "-";

export type PredictionRow = {
  dateISO: string;
  weekdayEs: string;
  period: DrawPeriod;
  n: number;
  rev: RevFlag;
  mr: number;
  source: "llm" | "fallback" | "csv" | "website" | "supplemental";
};

export type PredictionResponse = {
  from: string;
  to: string;
  rows: PredictionRow[];
  metadata: {
    usedLLM: boolean;
    model?: string;
    historyRecords: number;
    websiteMerged: boolean;
  };
};

export type HistoricalRow = {
  dateISO: string;
  weekdayEs: string;
  period: DrawPeriod;
  n: number;
  rev: RevFlag;
  mr: number;
};

export type PredictionSlot = {
  dateISO: string;
  weekdayEs: string;
  period: DrawPeriod;
  index: number;
};

export type PredictionInput = {
  from: string;
  to: string;
  slots: PredictionSlot[];
  history: HistoricalRow[];
};

export type PredictionEngineResult = {
  rows: PredictionRow[];
  model?: string;
};

export interface PredictionEngine {
  generate(input: PredictionInput): Promise<PredictionEngineResult>;
}

export type CandidateSlotRequest = {
  dateISO: string;
  period: DrawPeriod;
};

export type MonteCarloParams = {
  name: string;
  histDecay: number;
  transDecay: number;
  periodFreqW: number;
  globalFreqW: number;
  periodTransW: number;
  globalTransW: number;
  gapW: number;
  momentumW: number;
  temperature: number;
};

export type CandidatePrediction = {
  dateISO: string;
  period: DrawPeriod;
  n: number;
  rev: RevFlag;
  mr: number;
  revProbability: number;
  probability: number;
  relativeShare: number;
};

export type CandidateSlotResult = {
  slot: CandidateSlotRequest;
  candidates: CandidatePrediction[];
};

export type CandidateResponse = {
  model: string;
  selectedParams: MonteCarloParams;
  backtestMeanDigitError: number;
  slots: CandidateSlotResult[];
};

export type LoteriaNacionalRow = {
  dateISO: string;
  weekdayEs: string;
  numero: number;   // 0–99
  serie: number;     // 0–999
  source: "csv" | "predicted";
};

export type LoteriaNacionalResponse = {
  targetDate: string;
  history: LoteriaNacionalRow[];
  prediction: LoteriaNacionalRow;
  metadata: {
    model: string;
    historyRecords: number;
  };
};

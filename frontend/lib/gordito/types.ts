export type GorditoCandidate = {
  numero: number;   // 00–99
  serie: number;    // 000–999
  score: number;
  confidence: number;
  method: string;
};

export type GorditoResponse = {
  targetDate: string;
  sorteo: string;
  candidates: GorditoCandidate[];
  metadata: {
    model: string;
    historyRecords: number;
    crossCorrelationRecords: number;
    methods: string[];
  };
};

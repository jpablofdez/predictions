import { addDays, format, isValid, parseISO } from "date-fns";

import type { CandidateResponse, CandidateSlotRequest } from "../types";
import { COSTA_RICA_TIME_ZONE, currentDateISOInTimeZone } from "../utils/date";
import { buildMonteCarloCandidates } from "./montecarlo";
import { loadMergedHistory, type PredictionServiceDeps } from "./service";

export function buildDefaultCandidateSlots(referenceISO = currentDateISOInTimeZone()): CandidateSlotRequest[] {
  const date = parseISO(referenceISO);
  if (!isValid(date)) {
    throw new Error(`Invalid ISO date: ${referenceISO}`);
  }

  const nextDateISO = format(addDays(date, 1), "yyyy-MM-dd");

  return [
    { dateISO: referenceISO, period: "NOCHE" },
    { dateISO: nextDateISO, period: "MEDIODIA" },
    { dateISO: nextDateISO, period: "TARDE" },
    { dateISO: nextDateISO, period: "NOCHE" },
  ];
}

export function parseCandidateSlotsParam(rawValue: string | null): CandidateSlotRequest[] {
  if (!rawValue) {
    return buildDefaultCandidateSlots(currentDateISOInTimeZone(COSTA_RICA_TIME_ZONE));
  }

  return rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [dateISO, period] = entry.split(":");
      if (!dateISO || !period || !["MEDIODIA", "TARDE", "NOCHE"].includes(period)) {
        throw new Error(`Invalid candidate slot: ${entry}`);
      }

      return {
        dateISO,
        period: period as CandidateSlotRequest["period"],
      };
    });
}

export async function buildCandidateResponse(
  params: { slots?: CandidateSlotRequest[]; top?: number },
  deps: PredictionServiceDeps = {},
): Promise<CandidateResponse> {
  const { mergedHistory } = await loadMergedHistory(deps);

  return buildMonteCarloCandidates({
    history: mergedHistory,
    slots: params.slots ?? buildDefaultCandidateSlots(),
    top: params.top,
  });
}

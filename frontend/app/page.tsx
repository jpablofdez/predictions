"use client";

import { useEffect, useMemo, useState } from "react";

import { addDaysToISO, currentDateISOInTimeZone, DEFAULT_PREDICTION_FROM_ISO, formatDateEs } from "@/lib/utils/date";
import type { CandidateResponse, PredictionResponse, PredictionRow } from "@/lib/types";
import type { GorditoResponse } from "@/lib/gordito/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: PredictionResponse };

type CandidateLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CandidateResponse };

type GorditoLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: GorditoResponse };

function sourceLabel(source: PredictionRow["source"]) {
  switch (source) {
    case "llm":
      return "LLM";
    case "csv":
      return "CSV";
    case "website":
      return "Sitio Web";
    case "supplemental":
      return "Resultado";
    case "fallback":
      return "Predicción";
  }
}
export default function Home() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [candidateState, setCandidateState] = useState<CandidateLoadState>({ status: "loading" });
  const [gorditoState, setGorditoState] = useState<GorditoLoadState>({ status: "loading" });
  const todayISO = useMemo(() => currentDateISOInTimeZone(), []);
  const fromISO = DEFAULT_PREDICTION_FROM_ISO;
  const toISO = todayISO;
  const candidateSlots = useMemo(() => {
    const tomorrowISO = addDaysToISO(todayISO, 1);

    return [
      `${todayISO}:NOCHE`,
      `${tomorrowISO}:MEDIODIA`,
      `${tomorrowISO}:TARDE`,
      `${tomorrowISO}:NOCHE`,
    ].join(",");
  }, [todayISO]);

  useEffect(() => {
    const controller = new AbortController();

    const loadPredictions = async () => {
      try {
        const response = await fetch(`/api/predictions?from=${fromISO}&to=${toISO}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json()) as { details?: string };
          throw new Error(payload.details ?? "API request failed");
        }

        const payload = (await response.json()) as PredictionResponse;
        setState({ status: "ready", data: payload });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unexpected error";
        setState({ status: "error", message });
      }
    };

    const loadCandidates = async () => {
      try {
        const response = await fetch(`/api/candidates?slots=${candidateSlots}&top=3`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json()) as { details?: string };
          throw new Error(payload.details ?? "Candidate API request failed");
        }

        const payload = (await response.json()) as CandidateResponse;
        setCandidateState({ status: "ready", data: payload });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unexpected error";
        setCandidateState({ status: "error", message });
      }
    };

    const loadGordito = async () => {
      try {
        const response = await fetch(`/api/gordito?date=2026-07-05`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Gordito API request failed");
        }

        const payload = (await response.json()) as GorditoResponse;
        setGorditoState({ status: "ready", data: payload });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Unexpected error";
        setGorditoState({ status: "error", message });
      }
    };

    void loadPredictions();
    void loadCandidates();
    void loadGordito();

    return () => controller.abort();
  }, [candidateSlots, fromISO, toISO]);

  const stats = useMemo(() => {
    if (state.status !== "ready") {
      return null;
    }

    const days = new Set(state.data.rows.map((row) => row.dateISO)).size;

    return {
      rows: state.data.rows.length,
      days,
      source: state.data.metadata.model ?? (state.data.metadata.usedLLM ? "LLM" : "Adaptive Monte Carlo digit-channel"),
      websiteMerged: state.data.metadata.websiteMerged ? "Sí" : "No",
    };
  }, [state]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(32,157,215,0.16),_transparent_38%),radial-gradient(circle_at_right,_rgba(236,173,10,0.18),_transparent_42%),linear-gradient(165deg,_#f8fbff_0%,_#eef4fb_48%,_#f6f5fb_100%)] px-4 py-8 text-[#032147] sm:px-6 lg:px-10">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 rounded-3xl border border-white/60 bg-white/85 p-5 shadow-[0_18px_50px_rgba(3,33,71,0.12)] backdrop-blur sm:p-7">
        <header className="grid gap-4 rounded-2xl border border-[#209dd7]/25 bg-gradient-to-r from-[#032147] via-[#209dd7] to-[#753991] p-5 text-white">
          <p className="text-xs uppercase tracking-[0.3em] text-[#ecad0a]">Nuevos Tiempos Reventados</p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">prediction.csv</h1>
          <p className="text-sm text-white/85 sm:text-base">
            Números y predicciones desde {formatDateEs(fromISO)} hasta {formatDateEs(toISO)}.
          </p>
        </header>

        {gorditoState.status === "ready" && (
          <section className="rounded-2xl border-2 border-[#ecad0a]/40 bg-gradient-to-br from-[#032147] via-[#1a3a5c] to-[#753991] p-6 text-white shadow-[0_12px_40px_rgba(236,173,10,0.2)]">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#ecad0a]">
                  {gorditoState.data.sorteo}
                </p>
                <h2 className="mt-1 text-3xl font-bold">5 de Julio, 2026</h2>
                <p className="mt-1 text-sm text-white/70">
                  {gorditoState.data.metadata.model}
                </p>
              </div>
              <div className="text-right text-xs text-white/50">
                <p>{gorditoState.data.metadata.historyRecords} registros Lotería Nacional</p>
                <p>{gorditoState.data.metadata.crossCorrelationRecords} registros NTR (cross-correlation)</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {gorditoState.data.candidates.slice(0, 10).map((c, i) => (
                <article
                  key={`${c.numero}-${c.serie}`}
                  className={`rounded-2xl px-4 py-4 ${
                    i === 0
                      ? "border-2 border-[#ecad0a] bg-[#ecad0a]/15 shadow-[0_0_20px_rgba(236,173,10,0.3)]"
                      : i < 3
                        ? "border border-white/20 bg-white/10"
                        : "border border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold uppercase tracking-[0.2em] ${i === 0 ? "text-[#ecad0a]" : "text-white/50"}`}>
                      #{i + 1}
                    </span>
                    <span className="text-xs text-white/40">
                      {(c.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className={`mt-2 text-center text-3xl font-bold ${i === 0 ? "text-[#ecad0a]" : ""}`}>
                    {c.numero.toString().padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-center text-lg text-white/70">
                    Serie {c.serie.toString().padStart(3, "0")}
                  </p>
                  <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-white/30">
                    {c.method}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {gorditoState.data.metadata.methods.map((m) => (
                <span key={m} className="rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-wider text-white/60">
                  {m}
                </span>
              ))}
            </div>
          </section>
        )}

        {gorditoState.status === "loading" && (
          <section className="flex min-h-32 items-center justify-center rounded-2xl border-2 border-dashed border-[#ecad0a]/30 bg-[#032147]/5 p-6 text-center text-[#888888]">
            Generando predicciones del Gordito del Medio Año...
          </section>
        )}

        {gorditoState.status === "error" && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            No se pudo cargar la predicción del Gordito: {gorditoState.message}
          </section>
        )}

        {stats && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Filas" value={String(stats.rows)} color="#209dd7" />
            <MetricCard label="Fechas" value={String(stats.days)} color="#032147" />
            <MetricCard label="Motor" value={stats.source} color="#753991" />
            <MetricCard label="Fusión Sitio" value={stats.websiteMerged} color="#ecad0a" darkText />
          </section>
        )}

        {candidateState.status === "ready" && (
          <section className="rounded-2xl border border-[#753991]/15 bg-white p-5 shadow-[0_10px_32px_rgba(3,33,71,0.08)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#753991]">Modelo Monte Carlo</p>
                <h2 className="text-2xl font-semibold text-[#032147]">Números más cercanos</h2>
                <p className="text-sm text-[#888888]">
                  Motor {candidateState.data.selectedParams.name} con error medio histórico de{" "}
                  {candidateState.data.backtestMeanDigitError.toFixed(2)} dígitos.
                </p>
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#888888]">{candidateState.data.model}</p>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {candidateState.data.slots.map((slotResult) => (
                <article
                  key={`${slotResult.slot.dateISO}-${slotResult.slot.period}`}
                  className="rounded-2xl border border-[#032147]/10 bg-[linear-gradient(180deg,_rgba(32,157,215,0.06),_rgba(117,57,145,0.04))] p-4"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-[#888888]">
                    {formatDateEs(slotResult.slot.dateISO)}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-[#032147]">{slotResult.slot.period}</h3>
                  <div className="mt-4 space-y-3">
                    {slotResult.candidates.map((candidate, index) => (
                      <div
                        key={`${candidate.n}-${candidate.rev}-${candidate.mr}`}
                        className={`rounded-2xl px-3 py-3 ${
                          index === 0 ? "bg-[#032147] text-white" : "bg-white/90 text-[#032147]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm uppercase tracking-[0.16em] opacity-75">Opción {index + 1}</p>
                          <p className="text-sm font-semibold">
                            {(candidate.relativeShare * 100).toFixed(1)}%
                          </p>
                        </div>
                        <p className="mt-2 text-2xl font-semibold">
                          {candidate.n.toString().padStart(2, "0")} {candidate.rev}{" "}
                          {candidate.mr.toString().padStart(2, "0")}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {candidateState.status === "error" && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            No se pudo cargar la shortlist Monte Carlo: {candidateState.message}
          </section>
        )}

        {state.status === "loading" && (
          <section className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-[#209dd7]/45 bg-white/70 p-6 text-center text-[#888888]">
            Generando predicciones...
          </section>
        )}

        {state.status === "error" && (
          <section className="rounded-2xl border border-red-300 bg-red-50 p-6 text-red-700">
            <h2 className="text-lg font-semibold">No se pudo cargar la predicción</h2>
            <p className="mt-2 text-sm">{state.message}</p>
          </section>
        )}

        {state.status === "ready" && (
          <section className="overflow-hidden rounded-2xl border border-[#032147]/12 bg-white shadow-[0_10px_32px_rgba(3,33,71,0.08)]">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-[#032147] text-left text-xs uppercase tracking-[0.18em] text-white">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Día</th>
                    <th className="px-4 py-3">Sorteo</th>
                    <th className="px-4 py-3">N°</th>
                    <th className="px-4 py-3">Rev</th>
                    <th className="px-4 py-3">MR</th>
                    <th className="px-4 py-3">Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.rows.map((row, idx) => {
                    const isToday = row.dateISO === todayISO;

                    return (
                      <tr
                        key={`${row.dateISO}-${row.period}`}
                        className={idx % 2 === 0 ? "bg-white" : "bg-[#f7fafc]"}
                      >
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-sm font-medium text-[#032147] ${
                            isToday
                              ? "underline decoration-[#ecad0a] decoration-[3px] underline-offset-[6px]"
                              : ""
                          }`}
                        >
                          {formatDateEs(row.dateISO)}
                        </td>
                        <td
                          className={`px-4 py-3 text-sm text-[#888888] ${
                            isToday
                              ? "underline decoration-[#ecad0a] decoration-[3px] underline-offset-[6px]"
                              : ""
                          }`}
                        >
                          {row.weekdayEs}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-[#209dd7]">{row.period}</td>
                        <td className="px-4 py-3 text-sm font-semibold">{row.n.toString().padStart(2, "0")}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={
                              row.rev === "R"
                                ? "rounded-full bg-[#753991]/10 px-2 py-1 font-semibold text-[#753991]"
                                : "rounded-full bg-[#032147]/8 px-2 py-1 font-semibold text-[#888888]"
                            }
                          >
                            {row.rev}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold">{row.mr.toString().padStart(2, "0")}</td>
                        <td className="px-4 py-3 text-xs text-[#888888]">{sourceLabel(row.source)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
  darkText,
}: {
  label: string;
  value: string;
  color: string;
  darkText?: boolean;
}) {
  return (
    <article
      className="rounded-2xl px-4 py-3 shadow-[0_6px_18px_rgba(3,33,71,0.08)]"
      style={{ backgroundColor: color, color: darkText ? "#032147" : "white" }}
    >
      <p className="text-xs uppercase tracking-[0.15em] opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}

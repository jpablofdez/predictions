"use client";

import { useEffect, useState } from "react";
import type { LoteriaNacionalRow, LoteriaNacionalResponse } from "@/lib/loteria-nacional/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoteriaNacionalResponse };

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

function formatDateEs(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00");
  return d.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function LoteriaNacionalPage() {
  const [targetDate, setTargetDate] = useState("2026-06-21");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/loteria-nacional?date=${targetDate}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          throw new Error(body.error ?? "Error del servidor");
        }
        const data = await res.json() as LoteriaNacionalResponse;
        setState({ status: "ready", data });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: err instanceof Error ? err.message : "Error inesperado" });
      }
    }

    void load();
    return () => controller.abort();
  }, [targetDate]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(32,157,215,0.16),_transparent_38%),radial-gradient(circle_at_right,_rgba(236,173,10,0.18),_transparent_42%),linear-gradient(165deg,_#f8fbff_0%,_#eef4fb_48%,_#f6f5fb_100%)] px-4 py-8 text-[#032147] sm:px-6 lg:px-10">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 rounded-3xl border border-white/60 bg-white/85 p-5 shadow-[0_18px_50px_rgba(3,33,71,0.12)] backdrop-blur sm:p-7">
        <header className="grid gap-4 rounded-2xl border border-[#209dd7]/25 bg-gradient-to-r from-[#032147] via-[#209dd7] to-[#753991] p-5 text-white">
          <p className="text-xs uppercase tracking-[0.3em] text-[#ecad0a]">Junta de Proteccion Social</p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Loteria Nacional</h1>
          <p className="text-sm text-white/85 sm:text-base">
            Prediccion basada en numerologia Kabbalah para el sorteo dominical.
          </p>
        </header>

        {/* Date picker */}
        <section className="flex items-center gap-3 rounded-xl border border-[#209dd7]/20 bg-white p-4">
          <label htmlFor="target-date" className="text-sm font-medium text-[#032147]">
            Fecha del sorteo:
          </label>
          <input
            id="target-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#209dd7] focus:outline-none focus:ring-1 focus:ring-[#209dd7]"
          />
        </section>

        {state.status === "loading" && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#209dd7] border-t-transparent" />
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {state.message}
          </div>
        )}

        {state.status === "ready" && (
          <>
            {/* Prediction card */}
            <section className="rounded-2xl border-2 border-[#ecad0a]/40 bg-gradient-to-br from-[#ecad0a]/5 to-white p-6 shadow-[0_10px_32px_rgba(236,173,10,0.12)]">
              <p className="mb-1 text-xs uppercase tracking-[0.2em] text-[#753991]">Prediccion para</p>
              <p className="mb-4 text-lg font-semibold capitalize">{formatDateEs(state.data.targetDate)}</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#209dd7]/30 bg-white p-5 text-center shadow-sm">
                  <p className="mb-1 text-xs uppercase tracking-wider text-[#209dd7]">Numero Ganador</p>
                  <p className="text-5xl font-bold text-[#032147]">{pad2(state.data.prediction.numero)}</p>
                </div>
                <div className="rounded-xl border border-[#753991]/30 bg-white p-5 text-center shadow-sm">
                  <p className="mb-1 text-xs uppercase tracking-wider text-[#753991]">Serie</p>
                  <p className="text-5xl font-bold text-[#032147]">{pad3(state.data.prediction.serie)}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                <span className="rounded-full bg-[#753991]/10 px-2 py-0.5 text-[#753991]">
                  {state.data.metadata.model}
                </span>
                <span>{state.data.metadata.historyRecords} sorteos historicos</span>
              </div>
            </section>

            {/* History table */}
            <section className="rounded-2xl border border-[#209dd7]/15 bg-white p-5 shadow-[0_10px_32px_rgba(3,33,71,0.08)]">
              <h2 className="mb-4 text-lg font-semibold text-[#032147]">Historial de Sorteos</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#032147]/10 text-left text-xs uppercase tracking-wider text-[#032147]/60">
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Dia</th>
                      <th className="px-3 py-2 text-center">Numero</th>
                      <th className="px-3 py-2 text-center">Serie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...state.data.history].reverse().map((row) => (
                      <tr key={row.dateISO} className="border-b border-gray-100 transition-colors hover:bg-[#209dd7]/5">
                        <td className="px-3 py-2 font-mono text-xs">{row.dateISO}</td>
                        <td className="px-3 py-2 capitalize">{row.weekdayEs}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-block min-w-[2.5rem] rounded-lg bg-[#032147] px-2 py-0.5 font-mono font-bold text-white">
                            {pad2(row.numero)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-block min-w-[3rem] rounded-lg bg-[#209dd7]/15 px-2 py-0.5 font-mono font-bold text-[#209dd7]">
                            {pad3(row.serie)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Link back */}
            <a
              href="/"
              className="inline-flex items-center gap-1 text-sm text-[#209dd7] hover:underline"
            >
              &larr; Volver a Nuevos Tiempos Reventados
            </a>
          </>
        )}
      </main>
    </div>
  );
}

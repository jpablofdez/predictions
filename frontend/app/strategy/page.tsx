"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { FullStrategyResult } from "@/lib/prediction/cnn";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: FullStrategyResult };

const PERIOD_COLORS: Record<string, string> = {
  MEDIODIA: "#ecad0a",
  TARDE: "#209dd7",
  NOCHE: "#753991",
};

const PERIOD_LABELS: Record<string, string> = {
  MEDIODIA: "Mediodia (Sol/Tiferet)",
  TARDE: "Tarde (Venus/Netzach)",
  NOCHE: "Noche (Luna/Yesod)",
};

export default function StrategyPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const dateISO = "2026-05-02";
  const budget = 5000;

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/strategy?date=${dateISO}&budget=${budget}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Request failed");
        }
        const data = (await response.json()) as FullStrategyResult;
        setState({ status: "ready", data });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(117,57,145,0.18),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(236,173,10,0.15),_transparent_45%),linear-gradient(165deg,_#0a0a1a_0%,_#0d1b2a_48%,_#1a0a2e_100%)] px-4 py-8 text-white sm:px-6 lg:px-10">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-widest text-white/60 backdrop-blur transition hover:bg-white/10"
        >
          Volver al dashboard
        </Link>

        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#032147]/80 via-[#753991]/40 to-[#ecad0a]/20 p-6 backdrop-blur sm:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-[#ecad0a]">
            CNN Evolutionary Win-Nodes
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">
            Estrategia Sabado 2 de Mayo 2026
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Presupuesto: {budget.toLocaleString("es-CR")} colones — distribuido por confianza de nodos evolutivos
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-white/50 leading-relaxed">
            <strong className="text-white/70">Modelo:</strong> Red convolucional 1D con {PERIOD_COLORS ? "4 canales" : ""} de digitos
            (N decenas, N unidades, MR decenas, MR unidades). Poblacion de 24 nodos evoluciona
            durante 12 generaciones. Solo los nodos que <strong className="text-[#ecad0a]">GANAN</strong> (predicen
            digitos correctos) sobreviven y se reproducen. Los que pierden son eliminados o mutados.
            El ensemble final pondera los mejores nodos supervivientes.
          </div>
        </header>

        {state.status === "loading" && (
          <section className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-[#753991]/40 bg-white/5 p-8 text-center">
            <div>
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#ecad0a] border-t-transparent" />
              <p className="text-sm text-white/50">
                Evolucionando nodos CNN... (12 generaciones x 3 periodos)
              </p>
            </div>
          </section>
        )}

        {state.status === "error" && (
          <section className="rounded-2xl border border-red-500/30 bg-red-950/30 p-6 text-red-300">
            <h2 className="text-lg font-semibold">Error</h2>
            <p className="mt-2 text-sm">{state.message}</p>
          </section>
        )}

        {state.status === "ready" && (
          <>
            {/* Evolution stats */}
            <section className="grid gap-3 sm:grid-cols-4">
              <StatCard
                label="Generaciones"
                value={String(state.data.evolutionStats.generations)}
                color="#753991"
              />
              <StatCard
                label="Nodos ganadores"
                value={String(state.data.evolutionStats.survivingNodes)}
                color="#209dd7"
              />
              <StatCard
                label="Mejor fitness"
                value={state.data.evolutionStats.bestFitness.toFixed(1)}
                color="#ecad0a"
                darkText
              />
              <StatCard
                label="Fitness promedio"
                value={state.data.evolutionStats.avgFitness.toFixed(1)}
                color="#032147"
              />
            </section>

            {/* Strategy cards per period */}
            <div className="grid gap-5 lg:grid-cols-3">
              {state.data.strategies.map((strategy) => {
                const color = PERIOD_COLORS[strategy.period] ?? "#209dd7";
                const label = PERIOD_LABELS[strategy.period] ?? strategy.period;
                const totalBet = strategy.candidates.reduce((s, c) => s + c.suggestedBet, 0);

                return (
                  <article
                    key={strategy.period}
                    className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
                  >
                    <div
                      className="mb-4 rounded-xl px-4 py-3"
                      style={{ backgroundColor: color + "22", borderLeft: `4px solid ${color}` }}
                    >
                      <p className="text-xs uppercase tracking-widest" style={{ color }}>
                        {label}
                      </p>
                      <p className="mt-1 text-lg font-bold text-white">
                        {totalBet.toLocaleString("es-CR")} colones
                      </p>
                      <p className="text-xs text-white/40">
                        Consenso de nodos: {((strategy.candidates[0]?.nodeConsensus ?? 0) * 100).toFixed(0)}%
                      </p>
                    </div>

                    <div className="space-y-3">
                      {strategy.candidates.map((candidate, idx) => (
                        <div
                          key={`${candidate.n}-${candidate.mr}`}
                          className={`rounded-xl p-3 ${
                            idx === 0
                              ? "bg-white/10 ring-1 ring-white/20"
                              : "bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-wider text-white/40">
                              {idx === 0 ? "Apuesta principal" : `Opcion ${idx + 1}`}
                            </span>
                            {candidate.suggestedBet > 0 && (
                              <span
                                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                                style={{ backgroundColor: color + "33", color }}
                              >
                                {candidate.suggestedBet.toLocaleString("es-CR")} col
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex items-baseline gap-3">
                            <span className="text-2xl font-bold tabular-nums">
                              {candidate.n.toString().padStart(2, "0")}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-sm font-bold ${
                                candidate.rev === "R"
                                  ? "bg-[#753991]/30 text-[#c77dff]"
                                  : "bg-white/10 text-white/40"
                              }`}
                            >
                              {candidate.rev}
                            </span>
                            <span className="text-2xl font-bold tabular-nums">
                              {candidate.mr.toString().padStart(2, "0")}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, candidate.confidence * 100000)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-white/30">
                            Confianza: {(candidate.confidence * 100000).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Summary */}
            <section className="rounded-2xl border border-[#ecad0a]/20 bg-[#ecad0a]/5 p-5">
              <h2 className="text-lg font-semibold text-[#ecad0a]">Resumen de apuestas</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-white/40">
                      <th className="pb-2 pr-4">Sorteo</th>
                      <th className="pb-2 pr-4">N</th>
                      <th className="pb-2 pr-4">Rev</th>
                      <th className="pb-2 pr-4">MR</th>
                      <th className="pb-2 pr-4">Monto</th>
                      <th className="pb-2">Consenso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.strategies.map((s) => {
                      const top = s.candidates[0];
                      if (!top) return null;
                      return (
                        <tr key={s.period} className="border-t border-white/5">
                          <td className="py-2 pr-4 font-semibold" style={{ color: PERIOD_COLORS[s.period] }}>
                            {s.period}
                          </td>
                          <td className="py-2 pr-4 font-bold tabular-nums">
                            {top.n.toString().padStart(2, "0")}
                          </td>
                          <td className="py-2 pr-4">{top.rev}</td>
                          <td className="py-2 pr-4 font-bold tabular-nums">
                            {top.mr.toString().padStart(2, "0")}
                          </td>
                          <td className="py-2 pr-4 font-semibold text-[#ecad0a]">
                            {top.suggestedBet.toLocaleString("es-CR")} col
                          </td>
                          <td className="py-2">
                            {(top.nodeConsensus * 100).toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10">
                      <td colSpan={4} className="py-2 pr-4 text-xs uppercase tracking-wider text-white/40">
                        Total
                      </td>
                      <td className="py-2 pr-4 font-bold text-[#ecad0a]">
                        {state.data.strategies
                          .reduce((s, st) => s + (st.candidates[0]?.suggestedBet ?? 0), 0)
                          .toLocaleString("es-CR")}{" "}
                        col
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <p className="text-center text-[10px] text-white/20">
              Modelo: {state.data.model} | Los juegos de azar son aleatorios — juegue responsablemente
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
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
      className="rounded-2xl px-4 py-3 backdrop-blur"
      style={{ backgroundColor: color, color: darkText ? "#032147" : "white" }}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </article>
  );
}

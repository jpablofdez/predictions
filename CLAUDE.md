# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MVP web application for **Nuevos Tiempos Reventados** — a Costa Rican lottery prediction system. The app generates predictions for three daily draw periods (MEDIODIA, TARDE, NOCHE) using either an LLM or a deterministic fallback algorithm.

## Commands

All commands run from `frontend/`:

```bash
npm run dev          # Dev server on http://localhost:3000
npm run build        # Production build
npm run test         # Unit tests with coverage (80% line/function/statement, 70% branch thresholds)
npm run test:watch   # Unit tests in watch mode
npm run test:e2e     # Playwright E2E tests (headless, auto-starts dev server)
npm run test:e2e:headed  # E2E tests with browser visible
```

To run a single unit test file:
```bash
npx vitest run tests/unit/fallback.test.ts
```

## Architecture

### Request Flow

```
GET /api/predictions?from=2026-02-19&to=2026-03-31
↓
lib/prediction/service.ts — orchestrates:
  1. Parse prediction.csv (2025 historical data)
  2. Parse newprediction.csv (2026 known results — override predictions)
  3. Scrape live results from https://www.jps.go.cr/resultados/nuevos-tiempos-reventados
  4. Merge all history sources (CSV → supplemental → website; latest source wins)
  5. Build date/period slots for the requested range
  6. Separate slots into covered (have historical data) and uncovered (need prediction)
  7. Generate predictions for uncovered slots via LLM engine or fallback algorithm
  8. Combine covered + predicted rows, sorted by date then period
  9. Return PredictionResponse
```

### Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Single-page dashboard; fetches from API, renders table |
| `app/api/predictions/route.ts` | GET endpoint; wires `from`/`to` params to service |
| `lib/prediction/service.ts` | Core pipeline orchestration |
| `lib/prediction/llm.ts` | OpenAI engine (model: gpt-4.1-mini, temp: 0.2, max_tokens: 8000) |
| `lib/prediction/kabbalah.ts` | "Kabbalah numerology" engine — default prediction engine (see below) |
| `lib/prediction/fallback.ts` | "Bubbling flows fractal" algorithm — legacy fallback, deterministic |
| `lib/history/csv.ts` | PapaParse-based CSV parser; handles Spanish date headers |
| `lib/history/website.ts` | Cheerio-based scraper for the JPS website |
| `lib/history/merge.ts` | Map-based dedup by `dateISO|period`; latest source wins |
| `lib/utils/date.ts` | Spanish date parsing, ISO conversion, slot generation |
| `lib/types.ts` | `PredictionRow`, `PredictionResponse`, `DrawPeriod`, `RevFlag` |

### Data Files (repo root)

- `prediction.csv` — 2025 historical results used to establish patterns
- `newprediction.csv` — 2026 known results; these rows override generated predictions

### Environment Variables (optional)

- `OPENAI_API_KEY` — enables LLM generation; without it, fallback runs
- `OPENAI_MODEL` — defaults to `gpt-4.1-mini`
- `PREDICTION_CSV_PATH` — defaults to `../prediction.csv`
- `NEW_PREDICTION_CSV_PATH` — defaults to `../newprediction.csv`

### Kabbalah Numerology Engine (default)

`lib/prediction/kabbalah.ts` implements the "Kabbalah numerology" model:
- Analyzes digit channels (N tens/ones, MR tens/ones) separately
- **Sephirot resonance**: 10 emanations of the Tree of Life, each with digit affinities
- **Gematria reduction**: digital root harmony between date numerology and candidate digits
- **Hebrew letter paths**: 22-path cycle modulates transition scoring based on date position
- **Universal sequences**: Fibonacci, Lucas, triangular, and prime sequences as digit attractors
- **Planetary period mapping**: MEDIODIA=Sol/Tiferet, TARDE=Venus/Netzach, NOCHE=Luna/Yesod
- Frequency histograms with dual decay: `exp(-age/49)` (7x7) + `exp(-age/81)` (9x9)
- Transition matrices weighted by Tree of Life path modulation
- Rev prediction based on Gevurah (severity/judgment) resonance
- Softmax temperature varies by Sephirah depth
- Deterministic: seeded by date + period

### Legacy Fallback Algorithm

`lib/prediction/fallback.ts` implements the "Bubbling flows fractal" model:
- Analyzes digit channels (N tens/ones, MR tens/ones) separately
- Frequency histograms with recency decay: `exp(-age/histDecay)`
- Transition matrices with exponential decay: `exp(-age/transDecay)`
- Fibonacci-based lag analysis for fractal patterns (lags: 1,2,3,5,8,13,21,34,55,89)
- Gap pressure (penalizes digits not drawn recently) and momentum/streak detection
- Softmax temperature sampling for final digit selection
- Hyperparameter tuning: multiple candidate configs (`HYPERPARAMS_CANDIDATES`) evaluated against known history; best-fit config selected per run
- Scoring: frequency + transition + fractal + proximity + gap + momentum + seeded jitter
- Deterministic: seeded by date + period

### Type Definitions

```typescript
type DrawPeriod = "MEDIODIA" | "TARDE" | "NOCHE"
type RevFlag = "R" | "-"

type PredictionRow = {
  dateISO: string      // YYYY-MM-DD
  weekdayEs: string    // Spanish weekday
  period: DrawPeriod
  n: number            // 0–99
  rev: RevFlag
  mr: number           // 0–99
  source: "llm" | "fallback" | "csv" | "website" | "supplemental"
}

type HistoricalRow = {
  dateISO: string; weekdayEs: string; period: DrawPeriod
  n: number; rev: RevFlag; mr: number
}

type PredictionSlot = {
  dateISO: string; weekdayEs: string; period: DrawPeriod; index: number
}

interface PredictionEngine {
  generate(input: PredictionInput): Promise<PredictionEngineResult>
}
```

### Brand Colors

- Yellow `#ecad0a` — labels, highlights
- Blue `#209dd7` — period badges
- Purple `#753991` — Rev "R" badges
- Navy `#032147` — headers, main text

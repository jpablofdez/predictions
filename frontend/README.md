# prediction.csv frontend

Next.js MVP for Nuevos Tiempos Reventados predictions.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Tests

```bash
npm run test
npm run test:e2e
```

## Update historical CSVs

```bash
npm run history:update            # add latest JPS results to data/history
npm run history:update -- --dry-run
```

Runs automatically twice a day via launchd. See [`scripts/README.md`](scripts/README.md) for details.

## Optional environment

- `OPENAI_API_KEY`: enables LLM generation.
- `OPENAI_MODEL`: override model (default `gpt-4.1-mini`).
- `PREDICTION_CSV_PATH`: absolute or relative path to `prediction.csv`.
- `NEW_PREDICTION_CSV_PATH`: optional path to a supplemental CSV (defaults to `../newprediction.csv`) used to anchor known results.

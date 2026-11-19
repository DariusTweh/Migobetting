# MIGO Soccer Intelligence

Local-first soccer research, simulation, and historical-testing terminal built with Next.js and TypeScript.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

No Supabase project or account is required. Settings, builder legs, and paper bets are stored in the current browser with `localStorage`. Live fixtures are read server-side from ESPN's unofficial public scoreboard endpoints and cached by Next.js for five minutes.

## Current scope

- Live fixtures across the Premier League, La Liga, Bundesliga, Serie A, Ligue 1, and Champions League
- Transparent record-strength + analytical Poisson baseline probabilities
- Deterministic-seed 10K/50K/100K Monte Carlo match simulations in a Web Worker
- What-if attack assumptions, coherent market distributions, and bankroll-risk paths
- Local IndexedDB ingestion for football-data.co.uk or compatible historical CSV files
- Chronological historical replay with leakage guards, calibration, Brier score, log loss, and odds-gated ROI
- Correlation-aware same-match card probability calculations
- ESPN lineup projections from earlier completed-match starting XIs
- A 90-minute confirmation policy: projected before the window, confirmed only when ESPN returns 11 starters
- Match intelligence, manual odds builder, and local paper-bet ledger
- Strict live/demo/source labeling and no invented missing statistics

This is a research tool, not betting advice. More Monte Carlo trials reduce sampling noise; they do not make an unvalidated model more accurate.

## Historical data

Open Backtesting Lab and MIGO automatically synchronizes five domestic leagues across three completed seasons from football-data.co.uk, normalizes and deduplicates them in local IndexedDB, and runs the default held-out replay. Manual presets and compatible CSV upload remain available as optional controls. The replay engine uses the first 60% of the selected chronology as a warm-up and reports metrics on the final 40%.

Past ESPN starting XIs are valid for building player participation history and for a separately labeled 90-minute actual-XI experiment. They are not leaked into 24-hour or 6-hour forecasts. After the team-only replay completes, MIGO automatically enriches a bounded held-out Premier League cohort with real ESPN starters, reruns the comparison, and reports Model B/Model C coverage. Because ESPN does not provide original publication timestamps, Model C explicitly labels the 90-minute availability time as an assumption. Player impact remains neutral until a regularized lineup adjustment demonstrates held-out improvement.

Upcoming baseline forecasts are snapshotted automatically before kickoff. When MIGO is opened after the match, the results adapter checks ESPN, grades the preserved probabilities against the final score, and adds accuracy and Brier-score evidence to Paper Performance. Since this build is local-only, catch-up grading happens when the app is opened rather than while the computer is offline.

## Commands

```bash
npm test
npm run build
```

## Local data

Use Settings → Reset local data to remove browser-stored settings and paper bets. No user data is sent to a database.
# Migobetting

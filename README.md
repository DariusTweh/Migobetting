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

## MLS, UWCL and historical parlays

MLS (`usa.1`) and UEFA Women's Champions League (`uefa.wchampions`) appear in live fixtures, Simulation Lab, and the **same League selector** in Backtesting Lab as the five original domestic leagues. Select MLS or UEFA Women's Champions League and click **Run the historical test**; MIGO will automatically load three recent calendar years of ESPN final scores into the local historical store (when available), then run the standard historical replay with your selected market and threshold. These leagues are visible in the selector before any import, and once downloaded their matches are also included under **All leagues**. The top **Update data and test again** action refreshes the currently selected ESPN-backed league. No separate MLS/UWCL import panel is needed. ESPN coverage is not guaranteed complete; extra-time and penalty events are conservatively excluded when identifiable, and historical pre-match odds are not provided.

The Historical Parlay Lab uses only the imported 1X2 and O/U 2.5 decimal prices where present. It forms one-selection-per-match daily cards from held-out predictions and can PASS entirely if odds or positive model edges are missing. These imported CSV prices have no independently verified publication timestamps: its reported returns are **hypothetical price-linked scenarios**, not verified executable profits. In particular, ESPN-only MLS and UWCL results cannot produce priced parlay returns without an independent market-odds source. A day-level barrier also prevents the model from learning an earlier match's result before predicting another fixture on that same date.


## Simulated match center, fixture predictions and parlays

- Simulation Lab now has a **Live-style match** screen with a virtual 0–90-minute clock, play/pause/seek, live-updating synthetic score, passes, shots, cards, commentary and player statistics. It is NOT a real ESPN play-by-play feed. Simulated player statistics are fictional and must not be treated as player prop forecasts. Actual names are displayed only when ESPN supplies an eleven-player lineup; otherwise placeholders are used.
- Match Intelligence, Dashboard and probability simulation use local historical home/away goals from IndexedDB when sufficient valid previous matches are available; otherwise they use the original season-record model. Model version, evidence and unmodeled lineup impacts are shown.
- Command Center displays model-only Daily Double and Banger research cards, including predicted probabilities. Model-implied fair prices are NOT bookmaker odds.
- The Parlays & Builder page imports the exact suggested card legs and requires manually entered actual American odds to quote a combined payout. The combined paper parlay is saved as ONE ticket and appears in Paper Performance.
- The app grades paper parlay legs from ESPN final scores when reopened. This does not place or settle any real wager.
- GitHub Actions verifies unit tests and the Next.js production build on main.

Update a local clone using git pull origin main and npm run dev. Use npm ci only when dependencies need to be reinstalled and disk space is sufficient.


## Stable forecast versus match playback

Live-style match playback runs a **separate seeded 10,000-trial Poisson forecast in a Web Worker** when you select a fixture or the underlying goal model inputs change. This displays home/draw/away probabilities, totals, BTTS and the five most frequent exact scores.

- **Representative (default):** conditions the fictional 90-minute event timeline on the most common exact final score in those 10,000 trials. The clock, passes, goals, shots and player assignments are synthetic, not observations or player-prop projections. The most common exact score is not a guaranteed, or even majority-likely, result.
- **Alternate:** draws an independent fictional result and event timeline for the selected playback seed.
- **Changing the playback seed:** changes the fictional timeline but NOT the underlying model probabilities. In representative mode the final score stays fixed to the modal score; in alternate mode the final score can change.
- **Changing fixtures or imported model evidence:** recomputes the 10,000-trial probabilities and the representative score. Forecasts are not live in-game predictions, and do not use the real current match score.

This dual-display implementation does not add AI API credits, external paid sources, or real-time player tracking.

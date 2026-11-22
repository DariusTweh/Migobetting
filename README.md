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
- Transparent recency-weighted, opponent-adjusted goal ratings with a fitted low-score correction
- Deterministic-seed 10K/30K/50K/100K Monte Carlo match simulations in a Web Worker
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

MLS (`usa.1`) and UEFA Women's Champions League (`uefa.wchampions`) appear in live fixtures, Simulation Lab, and the **same League selector** in Backtesting Lab as the five original domestic leagues. The Backtesting Lab automatically accumulates three recent calendar years of MLS final scores alongside the five core domestic leagues; **Update data and test again** forces both sources to refresh when All leagues is selected. Selecting either ESPN-backed league and running the test still loads or refreshes that league directly. These leagues are visible in the selector before any import, and once downloaded their matches are also included under **All leagues**. No separate MLS/UWCL import panel is needed. ESPN coverage is not guaranteed complete; extra-time and penalty events are conservatively excluded when identifiable, and historical pre-match odds are not provided.

The Historical Parlay Lab uses only the imported 1X2 and O/U 2.5 decimal prices where present. It forms one-selection-per-match daily cards from held-out predictions and can PASS entirely if odds or positive model edges are missing. These imported CSV prices have no independently verified publication timestamps: its reported returns are **hypothetical price-linked scenarios**, not verified executable profits. In particular, ESPN-only MLS and UWCL results cannot produce priced parlay returns without an independent market-odds source. A day-level barrier also prevents the model from learning an earlier match's result before predicting another fixture on that same date.


## Simulated match center, fixture predictions and parlays

- Simulation Lab now has a **Live-style match** screen with a virtual 0–90-minute clock, play/pause/seek, live-updating synthetic score, passes, shots, cards, commentary and player statistics. It is NOT a real ESPN play-by-play feed. Simulated player statistics are fictional and must not be treated as player prop forecasts. Actual names are displayed only when ESPN supplies an eleven-player lineup; otherwise placeholders are used.
- Match Intelligence, Dashboard, forward validation and historical replay share the same recency-weighted, opponent-adjusted goal engine once a league has enough earlier matches. New or promoted teams use a heavily shrunk fitted league prior instead of discarding that history; the original season-record fallback remains only when the league itself has insufficient history. A fitted Dixon–Coles-style low-score correction improves draw/low-score coherence. Model version, evidence and unmodeled lineup impacts are shown.
- Command Center builds a Daily Double or Banger only when actual quotes match the ESPN fixtures and the price/quality criteria; otherwise it shows PASS. A quoted price is never represented as a guaranteed executable offer.
- Each qualifying Command Center card is automatically locked once per Pacific calendar day as a $10 simulation-only ticket. Paper Performance keeps the original legs and prices, grades every leg from ESPN finals, and reports ticket return and simulated P/L. Cards are never reconstructed after results are known.
- The Parlays & Builder page imports the exact suggested card legs and auto-fills their available bookmaker quotes. The user can manually update prices. The combined paper parlay is saved as ONE ticket and appears in Paper Performance.
- The app grades paper parlay legs from ESPN final scores when reopened. This does not place or settle any real wager.
- GitHub Actions verifies unit tests and the Next.js production build on main.

Update a local clone using git pull origin main and npm run dev. Use npm ci only when dependencies need to be reinstalled and disk space is sufficient.


## Stable forecast versus match playback

Live-style match playback runs a **separate seeded 30,000-trial correlation-adjusted score forecast in a Web Worker** when you select a fixture or the underlying goal model inputs change. This displays home/draw/away probabilities, totals, BTTS and the five most frequent exact scores.

- **Representative (optional illustration):** conditions the fictional 90-minute event timeline on the most common exact final score in those 30,000 trials. The clock, passes, goals, shots and player assignments are synthetic, not observations or player-prop projections. The most common exact score is not a guaranteed, or even majority-likely, result.
- **Sampled match (default):** draws an independent fictional result and event timeline from the complete model score distribution for the selected playback seed.
- **Changing the playback seed:** changes the fictional timeline but NOT the underlying model probabilities. In representative mode the final score stays fixed to the modal score; in alternate mode the final score can change.
- **Changing fixtures or imported model evidence:** recomputes the 30,000-trial probabilities and the representative score. Forecasts are not live in-game predictions, and do not use the real current match score.

This dual-display implementation does not add AI API credits, external paid sources, or real-time player tracking.


## 30,000-match simulation + free sportsbook odds (TheRundown)

The Match Simulator now runs **30,000 samples from the fitted score grid** per fixture in the background, including the model's low-score correlation adjustment. This reduces sampling noise relative to 10,000 but does not improve the underlying model's calibration. The displayed outcome distribution stays fixed when only the fictional playback seed changes.

For published bookmaker prices, MIGO uses **TheRundown V2 Free API** (prematch moneylines and main goal totals from DraftKings, FanDuel, and BetMGM, up to five minutes delayed) and falls back to limited ESPN-provided 1X2 prices where available.

1. Sign up for the Free key at https://therundown.io/docs/quickstart.
2. Create a private **.env.local** file beside package.json. Put this line in it:
   THERUNDOWN_API_KEY=YOUR_PERSONAL_KEY_HERE
3. Restart npm run dev so Next.js loads the new environment variable.
4. Open Command Center or /builder. The app reads /api/odds on the server; the key is never sent to the browser.
5. If using Vercel, add THERUNDOWN_API_KEY as a secret environment variable in project settings and redeploy.

Do not commit .env.local or put the actual API key into GitHub, chats, or screenshots.

For free quota protection, MIGO queries up to eight league/date combinations with events within the next 72 hours, filters to market IDs 1 and 3 and free sportsbook IDs 19/22/23, throttles to ~1 request/second, and caches each provider fetch for two hours. Repeated snapshots can still count against quota; watch the provider account usage and response errors.

**Automatic Daily Double and Banger cards now require actual matched same-bookmaker quotes**, reject prices shorter than -350 (including -1100), and require at least an indicative 1-percentage-point model-implied margin plus +100 for Daily Double or +400 for Banger. If the feed cannot supply a valid combination, MIGO outputs PASS instead of adding cheap legs. These model-implied edges are **not calibrated or validated profits**.

The Free plan does not include double chance or alternative totals such as Over 1.5 when the sportsbook's main line is 2.5. Women's UEFA Champions League is not listed among TheRundown's published soccer sport IDs and may show no odds. Missing quotes are never invented, and historical odds backtesting still requires a separate historical-odds dataset.


## Free TheRundown odds integration

1. Obtain your own free API key: https://docs.therundown.io/quickstart.
2. In the repository root create a LOCAL file named `.env.local` and put: `THERUNDOWN_API_KEY=your_actual_key_here`.
3. Restart `npm run dev`; open Command Center or Parlays & Builder. The server-only `/api/odds` endpoint reads your key. `.env.local` is Git-ignored. Never commit the key.
4. You can test the source/status without exposing your key by visiting `http://localhost:3000/api/odds`, which shows a JSON payload with `provider`, `setupRequired`, `quotes` and `errors` (no key value).

TheRundown V2 is the primary supported feed. It uses `X-TheRundown-Key`, requests prematch market IDs 1 (soccer three-way winner) and 3 (correctly specified goal totals), and currently scans matching upcoming ESPN fixtures within three days. To conserve the free allowance, it limits league/date batches to eight per request, fetches at no more than one request per second and caches provider responses for 45 minutes. The free plan is delayed around five minutes, capped at 20,000 data points/day and 200,000/month, and has no player props or odds-history access. Free published soccer IDs cover MLS, EPL, La Liga, Bundesliga, Serie A, Ligue 1 and men's UCL; **UEFA Women's Champions League is not in the published list** and must be treated as unsupported until live coverage is confirmed.

Automatic Daily Double / Banger slips require published prices from **the same sportsbook**, no more than one market per match, no leg priced shorter than -350, a positive model-implied margin (not a verified market edge), and combined quoted odds of at least +100 / +400 respectively. When those criteria are not met, the app shows PASS. ESPN 1X2 prices are an optional limited fallback without a separate API key. Unverified odds are never synthesized.

The app cannot authenticate to TheRundown from GitHub Actions because the actual secret stays local, so unit tests validate the documented response schema and CI verifies TypeScript/build; a real key is required to confirm live quotes.


## 2026–27 scoring coverage, score calibration and complete fixtures

- **Current domestic seasons included:** automatic history sync now imports 2026–27 results and odds files from Football-Data.co.uk for Premier League, La Liga, Bundesliga, Serie A and Ligue 1, alongside older seasons. The browser checks for missing current-season records and refreshes the core archive after 12 hours. This supplies recent goal form instead of reusing stale 2025–26-only scores.
- **MLS and UEFA Women's Champions League history:** the main app will attempt to import the previous and current calendar years of completed ESPN scores when these competitions lack a sufficient local historical sample. These feeds may be incomplete; when adequate verified results are absent, predictions remain explicitly limited or based on the original generic W-D-L fallback.
- **Goal calibration diagnostics:** Backtesting Lab now reports held-out predicted versus actual average home/away/total goals, the Over 2.5 rate, draw rate, and the frequency of exact 1–0 / 1–1 scores, including goal averages by league. Any detected bias is shown, **not silently corrected using the test matches**; training a new adjustment on a separate validation set and confirming it on untouched future matches is still required.
- **Score-distribution display:** Fixture Intelligence and the 30K simulator distinguish the most frequent *individual* exact score from the total probability of 0–1 goals, 2–3 goals, and 4+ goals. A recurring 1–1 mode is often a 10–15% event, not a majority prediction. The sampled-match playback is the default; modal-score playback remains an optional illustration.
- **Fixture coverage:** ESPN's undated scoreboard often omits upcoming soccer games. The app now requests dated scoreboards across the next 10 days, plus yesterday's results, deduplicates results while retaining fresh live statuses, and displays **all returned fixtures** instead of silently limiting the Command Center to 30. A league genuinely without games in the requested window may still have no fixtures.
- ESPN APIs are undocumented and sometimes incomplete; fixture coverage is broader, not a guaranteed complete official league schedule. The app still uses available ESPN fixture IDs for detail views.

To inspect scoring calibration, open **/backtest**, select a league (or All), and run the historical test. To see full fixtures, open Command Center and choose All Matches. The goal model should not be altered merely to produce more 3–0 or 4–1 scores without evidence of genuine underprediction.

## MIGO AI — OpenAI reasoning, protected and on demand

Match Intelligence and quoted Command Center Daily Double/Banger cards now include an **Analyze with OpenAI** button. The AI audits the exact deterministic model evidence and available bookmaker quotes, without changing numerical probabilities, selected legs, paper tickets or sportsbook prices. It does not claim to have outside injury/news verification.

### Configure on Vercel

1. Create a dedicated project API key in the OpenAI Platform; configure API project usage limits. ChatGPT subscriptions and OpenAI API credits are billed separately.
2. In Vercel, open your MIGO project > Settings > Environment Variables. Add **OPENAI_API_KEY** (the OpenAI project key), **MIGO_AI_ACCESS_TOKEN** (a separate unique random passphrase at least 16 characters long), and optionally **OPENAI_MODEL** (default: gpt-6.1-sol). To generate an access passphrase on your device: run `openssl rand -hex 24`. Never reuse the actual OpenAI API key as the passphrase.
3. Apply secrets to **Production** (Preview only if you want that environment enabled) and redeploy the project.
4. Open a fixture or a priced Daily Double/Banger card. Enter the exact MIGO_AI_ACCESS_TOKEN in the **Private MIGO access passphrase** field and click **Analyze with OpenAI**. That passphrase is kept in this browser tab's sessionStorage only; no OpenAI key reaches the browser.
5. GET /api/ai/analyze reports only available/protected/model/mode for configuration checks, and never returns secrets.

### Charges and security

Every Analyze click can incur API charges; no auto-running requests occur on page load, simulation, daily paper picks or dashboard refresh. Requests use OpenAI Responses API with store:false, medium reasoning, max 2,400 output tokens, strict structured JSON, timeout, and best-effort 5-request-per-minute protection. The in-memory rate cap is not shared across Vercel serverless instances: add durable Vercel WAF/rate limits or deployment protection before distributing access, and use OpenAI project spending limits. Only the user's separate MIGO passphrase is sent by the browser; the server holds the OpenAI API key.

This is a **summary of evidence, risks and missing data**, not hidden internal chain-of-thought, an internet search, proof of profitable odds, or a bet placement system. AI verdicts are editorial and never replace the tested statistical engine.

### Local development

Create .env.local beside package.json using .env.example. Put OPENAI_API_KEY, MIGO_AI_ACCESS_TOKEN, and optionally OPENAI_MODEL in the file. Restart npm run dev. Never commit .env.local or actual secrets.

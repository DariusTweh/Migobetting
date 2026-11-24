# MIGO Soccer Intelligence

Soccer fixture research, statistical match forecasts, simulation and paper-parlay tracking. Built with Next.js and TypeScript.

## Dashboard

- **Strongest Model Pick:** one upcoming selection (next 72 hours), showing match, market, estimated probability and a bookmaker quote when available. When no eligible quote exists, it is explicitly labeled **Model Lean** rather than a priced bet. When the data is inadequate, MIGO shows **PASS**. Opening Command Center before kickoff automatically records its top selection.
- **Daily Double / Banger:** priced research slips using markets quoted by one bookmaker, targeting at least +100 / +400 combined American odds. Automatic picks reject legs shorter than -350 and avoid multiple selections from the same match.
- **Fixtures:** ESPN soccer scoreboards for the five major European domestic leagues, men's Champions League, MLS and UEFA Women's Champions League, including dated schedule requests across the next 10 days.
- **Fixture details / Paper:** every eligible upcoming fixture shows its strongest model market immediately below the matchup. Visiting it before kickoff locks the first available selection for that fixture. For a finished match, only a previously recorded pick is shown; the app refuses to backfill results as if they were predictions. Paper Performance displays a dedicated Strongest Pick Record with W–L, accuracy, model probabilities, available prices, final scores and a Refresh results control. Singles and parlays remain separate. No wager is placed.
- **Last 3 Days on Paper:** requests the current, prior and two-days-ago Pacific calendar dates from ESPN and displays their completed matches. Previously saved strongest-pick snapshots and the older model's forward 1X2 predictions are marked **SAVED** and graded against real scores. If a match had no saved prediction, MIGO can display a **HISTORICAL REPLAY** made with only earlier goal data. Replays are not counted toward the genuine Strongest Pick Record; they cannot prove that a selection was originally offered before kickoff. Games without usable past data are shown without a fake pick. The **Historical Replay W–L** card maintains its own cumulative wins, losses and hit rate for graded retrospective matches as each recent match is reviewed. This independent browser-local record keeps the originally graded replay (including the model version) even after future updates and never inflates genuine pre-kickoff win rates. Open its details to see every archived replay; it includes only past games retrieved while using Paper, not the entire multi-season Backtesting Lab archive.

## Match Details · Past matches, H2H and first-half research

- **Form / H2H** tab uses the existing verified completed-match history. Choose home team, H2H, or away team; limit to last 5/10, all venues or home/away only, and optionally the current competition. It displays actual scores, results, team form, streaks, H2H W–D–L, goal totals and BTTS. It excludes matches from the fixture's UTC date or any later date, preventing same-day score leakage from Football-Data's date-only records.
- **1st Half** tab now runs `migo-first-half-cross-league-v2`. It forecasts first-half Over 0.5, Over 1.5, home first-half goal, away first-half goal, halftime draw, and likely halftime scores using real earlier first-half match scores. It does **not** infer first-half scores by halving full-time goals.
- **Team-first model:** A Champions League match can use each club's actual earlier domestic results (e.g. Real Madrid in La Liga, Bayern in Bundesliga), plus any verified European halftime games. The model measures first-half goals **scored** and **allowed**, home/away venue splits, opponent-adjusted attack/defense indexes, 210-day recency decay, and each competition's own scoring baseline to limit unfair cross-league mixing. Results from the current fixture's UTC date or later are always excluded.
- **Data collection:** The current + previous three seasons are available via the Football-Data CSV importer for Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Belgium, Turkey, Greece, and Scotland where published. Existing big-five history is reused; club-specific additional leagues are fetched only when needed.
- **ESPN Champions League enrichment:** An on-demand endpoint retrieves the two clubs' previous completed UEFA matches. It accepts half-time numbers only from explicitly reconciled period line scores or complete, score-reconciled goal-event timelines. ESPN's public feed may omit details; missing/ambiguous data are discarded, not assigned 0–0. Women's UEFA fixtures remain completely separate from men's domestic matches.
- **Transparency:** Match Details shows team-specific prior-game sample counts, recent first-half goals scored and allowed, attack index, defensive vulnerability, model score probabilities, and available UEFA/source coverage. A prediction stays unavailable if either club has insufficient verified data. The UEFA cross-league baseline is **experimental**, not independently calibrated or bookmaker-priced, and is not automatically used in Daily Double/Banger slips.
- **Validation:** Simulation Lab allows historical first-half walk-forward comparisons with predicted vs observed frequencies, Brier and log-loss, including UEFA matches when genuine prior UEFA halftime results are available. This is retrospective testing, not proof of a profitable or forward-verified model.

## Predictions and simulation

- Historical scoring models use opponent adjustment, recency weighting, league goal rates and a fitted low-score correction when enough prior completed-match data exists. Season W-D-L is the fallback, not a replacement for verified scoring evidence.
- Completed domestic-league results include the 2026–27 season, updated when needed. MLS and women's Champions League historical coverage is limited by ESPN's available feeds.
- The 30,000-trial simulated forecast shows W/D/L, goal totals and likely score ranges. The synthetic 90-minute match playback includes a scoreboard, player stat allocations and commentary. These are **simulated**, not live ESPN events.
- Changing a playback seed changes a sampled hypothetical match but does not change the underlying forecast distribution.
- Backtesting Lab evaluates held-out historical predictions, scoring bias, calibration and historical-paper-parlay scenarios with strict separation of earlier results from later fixtures.

## Simulation · tactical broadcast and halftime model validation

- **Virtual match centre:** the `Live-style match` tab now opens with a responsive top-down soccer pitch, 22 animated player tokens, a ball, synthetic passing/shot paths, goal-event callouts, match clock, possession proxy, commentary and play/pause/restart/seek/speed controls. All animations are deterministic given the existing synthetic match tape and user seed; they are **not real player tracking**.
- **Forecast consistency:** the existing 30,000-scenario Monte Carlo analysis remains the separate pre-match probability forecast. Changing a playback seed changes only the illustrated match or selected sample, never the 30,000-trial probabilities for fixed model inputs.
- **1H validation tab:** choose a league and the maximum matches per season, then run retrospective walk-forward first-half model evaluations on genuine imported halftime scores. Reports include predicted-vs-observed goals for five markets, Brier/log-loss diagnostics, ≥68% hit counts, per-season comparisons, and reliability bands for 1H Over 0.5 and Over 1.5.
- **Scope:** evaluation is performed on demand, in the browser, using the local IndexedDB history. Seasons with insufficient earlier halftime samples are excluded from scoring. Validation results are *not* automatically applied as corrected probabilities, used in generated betting slips, or evidence of bookmaker profitability. Market calibration requires further out-of-sample evidence.

## Daily Double / Banger: today-only Pacific schedule

- Automatic **Daily Double**, **Banger**, and the homepage **Today’s Strongest Model Pick** only inspect **not-yet-started scheduled games with kickoffs on the current America/Los_Angeles calendar date**. The fixture browser retains its independent Today/Tomorrow/date filters. No rolling 72-hour horizon is used to assemble the day's ticket.
- Server UTC fixtures are grouped by the user's Pacific date, including daylight-saving transitions. MIGO refreshes the homepage slate every minute so the day changes at local midnight. All-day cards display today's date and remaining game count.
- The rule lives in `lib/daily-slate.ts` and is enforced in priced automatic tickets, model-only research tickets, imported builder auto-slip URLs, automatic paper snapshots, and manually saved tickets labeled Daily Double/Banger. A **custom manual parlay** can intentionally use future dates.
- If there are not enough qualifying **today** fixtures or price quotes to reach the +100 goal, the result is **PASS**, not a parlay padded with tomorrow's picks. Existing paper records remain unchanged.

## Out-of-sample calibration and guarded activation

- **Simulation Lab → OOS Calibration** runs chronological probability tests on actual match history (separate first-half and full-time models) and can test one league or all available competitions.
- Every calibration cohort uses **prior-match-only walk-forward forecasts**. Within each market and competition, the recorded predictions are split by *date* into a 60% fitting period, 20% validation period and 20% untouched later test period. A restrained log-odds correction is fitted using only the earliest period. If validation **and** the final held-out test fail to improve Brier score, or the final log loss fails to improve, the adjustment is **rejected**.
- At least 150 out-of-sample forecasts across 45 match days are required, with adequate samples in all three chronological partitions. Inadequate samples and unproven markets stay **raw**, not silently marked calibrated. Training/results never mix 1H and FT, separate competitions, or women's and men's football.
- Approved corrections persist in this browser's local storage and automatically affect eligible future match-detail probabilities, strongest-pick research, quoted-odds candidate comparisons and automatic parlay research. First-half market overlays use the same approved-profile gate. Only dates **after** the training/test history can receive the correction; saved pre-match records remain immutable. A failed re-test removes an older correction.
- Full-time **1X2** markets are adjusted as a group only when all three outcomes independently pass, then normalized so home/draw/away sum to 100%; double chance is re-derived from 1X2. Goal totals obey necessary monotonic bounds (Over 2.5 ≤ Over 1.5), and BTTS cannot exceed Over 1.5. Half-time Over 1.5 is bounded by Over 0.5.
- **Scope/limitation:** These are post-model *market-probability* adjustments, not a new physically coherent joint score model. The 30,000-match simulations, expected goals, and exact scorelines remain on their unmodified raw distribution; calibrated market views say so explicitly. These tests do not establish executable bookmaker odds, profitable edges, or independent future live performance.
- Automatic promotion requires a user-initiated validation run because the multi-league evaluation is expensive and uses browser-local historical records. The results and approved profiles are stored in the browser, not synced to a backend.

## Development

```bash
npm ci
npm run dev
```

Run `npm test` and `npm run build` to verify changes. Project CI runs both checks on each push to `main`.

## Optional odds feed on Vercel

Add `THERUNDOWN_API_KEY` in your Vercel project's **Settings → Environment Variables**, select Production, save and redeploy. Do not put API keys in `NEXT_PUBLIC_*` variables or commit them. If TheRundown is not configured, ESPN's limited displayed moneyline quotes remain an optional fallback. `THE_ODDS_API_KEY` is supported as a separate alternative feed when the primary key is unset.

TheRundown free pre-match quotes are delayed and may not include every competition or market. Missing market lines, alternative totals or women's Champions League odds must not be invented. MIGO will show PASS rather than assemble a slip from unavailable prices.

## Data and scope

- The strongest-pick ledger is a **browser-local forward record**, not a tamper-proof server audit: a pick is saved only when a user visits the Command Center or a fixture before kickoff. Grading checks ESPN final scores when Paper Performance is opened or refreshed. No retroactive entries, automatic betting, background grading while the app is closed, or cross-device sync. Clearing local site data loses the record.
- Predictions are **uncalibrated statistical estimates**. Quoted odds can change, may not be available in your jurisdiction, and do not prove an edge.
- ESPN schedule and results endpoints are unofficial and can omit games. Fixture coverage is expanded but not guaranteed complete.

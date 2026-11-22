# MIGO Soccer Intelligence

Soccer fixture research, statistical match forecasts, simulation and paper-parlay tracking. Built with Next.js and TypeScript.

## Dashboard

- **Strongest Model Pick:** one upcoming selection (next 72 hours), showing match, market, estimated probability and a bookmaker quote when available. When no eligible quote exists, it is explicitly labeled **Model Lean** rather than a priced bet. When the data is inadequate, MIGO shows **PASS**. Opening Command Center before kickoff automatically records its top selection.
- **Daily Double / Banger:** priced research slips using markets quoted by one bookmaker, targeting at least +100 / +400 combined American odds. Automatic picks reject legs shorter than -350 and avoid multiple selections from the same match.
- **Fixtures:** ESPN soccer scoreboards for the five major European domestic leagues, men's Champions League, MLS and UEFA Women's Champions League, including dated schedule requests across the next 10 days.
- **Fixture details / Paper:** every eligible upcoming fixture shows its strongest model market immediately below the matchup. Visiting it before kickoff locks the first available selection for that fixture. For a finished match, only a previously recorded pick is shown; the app refuses to backfill results as if they were predictions. Paper Performance displays a dedicated Strongest Pick Record with W–L, accuracy, model probabilities, available prices, final scores and a Refresh results control. Singles and parlays remain separate. No wager is placed.
- **Last 3 Days on Paper:** requests the current, prior and two-days-ago Pacific calendar dates from ESPN and displays their completed matches. Previously saved strongest-pick snapshots and the older model's forward 1X2 predictions are marked **SAVED** and graded against real scores. If a match had no saved prediction, MIGO can display a **HISTORICAL REPLAY** made with only earlier goal data. Replays are not counted toward the genuine Strongest Pick Record; they cannot prove that a selection was originally offered before kickoff. Games without usable past data are shown without a fake pick.

## Predictions and simulation

- Historical scoring models use opponent adjustment, recency weighting, league goal rates and a fitted low-score correction when enough prior completed-match data exists. Season W-D-L is the fallback, not a replacement for verified scoring evidence.
- Completed domestic-league results include the 2026–27 season, updated when needed. MLS and women's Champions League historical coverage is limited by ESPN's available feeds.
- The 30,000-trial simulated forecast shows W/D/L, goal totals and likely score ranges. The synthetic 90-minute match playback includes a scoreboard, player stat allocations and commentary. These are **simulated**, not live ESPN events.
- Changing a playback seed changes a sampled hypothetical match but does not change the underlying forecast distribution.
- Backtesting Lab evaluates held-out historical predictions, scoring bias, calibration and historical-paper-parlay scenarios with strict separation of earlier results from later fixtures.

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

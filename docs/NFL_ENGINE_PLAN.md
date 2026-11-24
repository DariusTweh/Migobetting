# MIGO NFL Intelligence — implementation plan

## Goal
Provide evidence-backed NFL offensive player-prop research and game-script slip construction inside the existing MIGO Betting Next.js app. A research score is not a hit probability; a probability is not a sportsbook quote. No parlay is a guaranteed lock.

## Repo integration
- Shared Next.js app shell and layout; /nfl is an independent route, with /api/nfl as its data API.
- NFL-specific modules live under lib/nfl; do not import soccer score/Poisson logic to estimate NFL player props.
- Keep soccer Daily Double, strongest pick, calibration, and paper ledger behavior unchanged.

## End-to-end prediction pipeline
1. **Ingest** verified schedules, player/team IDs, box scores, and a source timestamp. Save a frozen pre-kickoff snapshot and reject future results.
2. **Confirm player eligibility** (active/inactive, projected role, QB starter, snap share and recent usage). If injured status or role is uncertain, warn or PASS.
3. **Project opportunities first**: offensive plays; passing attempts; dropback and scramble share; carry share; routes; target share; red-zone and goal-to-go roles. Last 3 games matter, shrunk toward the season role.
4. **Project efficiency second**: yards per pass attempt, yards per target, yards per carry, air yards, missed tackles, offensive line, opposing pass/run defense, coverage and pressure.
5. **Model game environment**: optional total and spread, home/away, weather and pace; derive scenarios (leading, close, trailing). Do not assume the favorite only runs.
6. **Generate distributions by market**: completions/attempts, passing/rushing/receiving yards, receptions and touchdowns. Preserve coherent team opportunity totals.
7. **Simulate correlated games** (target: 30,000 seeded trials): shared game pace, pass/run rate, injury scenarios, team scores and role changes. SGP probability comes from joint outcomes, not independent multiplication.
8. **Calibrate out of sample** with strict pre-game time cutoffs and season/week blocked folds. Report Brier score, log loss, bucket reliability and 2026 forward performance separately from historical replay.
9. **Price carefully**: fair break-even odds only from validated, calibrated probabilities. BetMGM screenshot/manual odds optional; otherwise clearly mark model-fair research pricing, not an offered book quote.
10. **Build daily slips**: Anchor (restrained), Glory (higher payout), Lotto optional. Only remaining games on today's Pacific date qualify; otherwise PASS.

## MIGO analyst rules
- Evaluation weights: usage 35%; opponent 25%; game script 20%; efficiency 10%; context 10%.
- These are explanation/quality weights, not probability weights. Only the forecast distribution and calibration produce hit probability.
- Prefer alternate-yardage thresholds supported by distribution, not just player averages; do not stack ultra-short -900 legs without benefit.
- Explain why each leg fits the scenario and give the plausible failure mode.
- Do not assume alternate receptions are offered on BetMGM; permit standard receptions O/U and common yardage alt tiers.
- Verify sample counts, last-three opportunity trend, matchup resistance, pace/total/spread and player eligibility.
- No wagering execution. Research, recommendations and paper tracking only.

## Data integrity
**v1 (implemented in draft PR):** ESPN unofficial NFL schedule, team completed-game schedules, game-box players and named statistical columns. A missing athlete/category box-score row is unknown, not a zero. Opponent positional totals are descriptive until league-normalized, not a betting edge. No trusted snap share, routes, injury or weather source. Thus v1 research ratings are capped below 70 and calibrated probabilities/fair odds are null.

**Phase 2:** Add a source adapter and verified nflverse or equivalent play-by-play, participation, red-zone, depth-chart, injury and opponent-adjusted defense feeds. Audit ID mapping, completeness, timestamps, licenses and provider gaps.

**Phase 3:** Train opportunity-to-stat forecasts, simulation and market-level distributions; version all feature snapshots.

**Phase 4:** Walk-forward held-out calibration by player position and market. PASS when sample quality is inadequate; show uncertainty and honest expected accuracy.

**Phase 5:** Correlated SGP optimizer; manual BetMGM lines and odds, model-only fallback, Daily Double / Glory selection, immutable paper ledger, retrospective grading and forward performance.

## v1 delivered
- Independent NFL route, nav, matchup research interface and /api/nfl endpoint.
- Date-scoped, deduplicated NFL fixtures with ESPN.
- Historic game-box ingestion with labeled stats and explicit zero/missing differentiation.
- No-hindsight gate and PASS on low coverage.
- Transparent framework research scores; alternate passing/rushing/receiving/receptions ideas.
- Up-to-six-leg paper research slip with only one market per athlete and copy action.
- Unit tests for leakage, sparse data, provider parsing and scoring.
- GitHub PR verification for tests and production build.

## Release criteria
- GitHub CI and Vercel preview pass.
- Real 2026 ESPN response shape verified and player game logs not silently empty.
- UI distinguishes research confidence from calibrated probability.
- Only pregame selections count as forward predictions.
- All existing soccer screens and workflows remain intact.

## Phase 2 status (2026-11-24)
Implemented supplemental nflverse adapters and verified them against a real Vercel preview:
- Current-season player-week stats and 2026 offensive snap counts successfully load.
- Out-of-sample eligibility is guarded at the **season/week** level; games on or after the fixture week are excluded even when the weekly provider lacks exact game dates.
- A live **LAR vs GB** test returned 21 candidate props from 225 player game lines, with 10 research-eligible and 11 PASS. This is a coverage test, not evidence of predictive accuracy.
- Verified recent targets, carries, passing attempts, target share, snap participation, and league-normalized opponent positional volume are shown with per-player evidence.
- A current-week injury CSV is loaded, including the 2026 format that lacks a row-level modification timestamp. Undated conflicting statuses force PASS; absence of an injury row **never** means confirmed active.
- ESPN season team-history feeds returned no prior games in the first test; NFL weekly history therefore uses official published nflverse player-week values, not fabricated dates. ESPN remains the fixture provider/fallback.
- Tested parsing, schema validation, date/week leakage, unique player matching, doubtful/OUT safeguards, and contradictory injury records.

### Remaining source gaps
The engine still lacks game-day active inactives, verified route participation, red-zone/goal-line opportunities, weather, full defensive efficiency metrics, and a stable book quote feed. Probabilities and fair odds are intentionally null. These must be connected and backtested before calling the model calibrated or enabling a genuine probability-ranked Glory builder.

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

## Phase 3 simulation delivery (2026-11-24)

Implemented `lib/nfl/simulation.ts`, `tests/nfl-simulation.test.ts` and an interactive scenario panel in the existing NFL Prop Lab.

### Raw Monte Carlo research outputs
- **30,000 deterministically seeded draws** per eligible matchup, with an optional 100–30,000 draw test mode. Repeated requests with the same game/seed generate identical outputs.
- Team-level pass/rush opportunity budgets are estimated from the prior six regular-season games, blending the last three with the full sample.
- Eligible WR/TE/RB targets are drawn against the QB pass-attempt budget, including a residual `other` category for unmodeled players; catches and yards arise from those target draws. QB passing yards include modeled + residual receiving yardage rather than an unrelated independent QB draw.
- Rush attempts similarly allocate to eligible RB/QB/WR workload shares. Shared pace and opposite game scripts make same-game outcomes dependent; the market spread and total only provide **bounded, explicitly uncalibrated** scenario adjustments.
- Simulated passing TDs use prior team QB TDs per attempt, drawn in the same team passing/scoring environment. Receiver TD allocation is **not** implemented.
- Automatically PASS if either team has fewer than four historical weeks of credible pass/rush workloads, there is no credible quarterback, or the historical starter is reported unavailable. OUT/doubtful recipients are excluded from the simulation opportunity pool.
- Every model-eligible existing research prop has raw simulated hit rate, simulated mean, 10th/50th/90th percentile, simulation seed and trials. Non-eligible props remain unpriced.
- User may select 2–6 eligible legs and request **one joint 30,000-draw scenario** that checks each full-game draw against every selected leg. The independence product is shown strictly for contrast, not used as a joint estimate.
- `modelStatus: UNCALIBRATED` remains explicit; no fair odds, no claimed value, no sportsbook payout, no bookmaker execution.

### Verified live
- Vercel Rams–Packers preview returned **21 research candidates, 10 simulation-eligible markets, 30,000 draws**.
- Examples as of test: Kyren Williams 25+ rush at raw simulated 0.8648; Stafford 1+ passing TD at 0.7541. These figures may not reflect true probabilities.
- Real same-game example: Kyren 25+ rush AND Stafford 1+ pass TD met jointly in **19,537/30,000** draws (0.6512), compared with the independent product of 0.6521. This correctly demonstrates that the code evaluates the joint draw rather than simply multiplying marginals; it does not validate model accuracy.
- CI tests cover fixed seed, historical-week no-hindsight, alt-line monotonicity, joint ceiling, correlation, missing-team PASS and known injured-player exclusion.

### Mandatory before calling probabilities reliable
1. Create a **chronological weekly backtester** that freezes historical feature windows strictly before the target games. Avoid 2026 retrospective use of current injury data: those reports may lack historical timestamps.
2. Quantify Brier score, log loss, reliability bins, sample sizes, coverage, and calibration differences by market and position.
3. Fit calibrators only on earlier periods; validate on held-out weeks and seasons. Require minimum counts and shrinkage where data is sparse.
4. Persist versioned pregame predictions and actual graded outcomes for forward evaluation. Compare to simple baseline models before interpreting new complexity as improvement.
5. Add verified game-day actives, routes/red-zone roles, opponent pressure/coverage, weather and bookmaker input. Only then enable credible fair-odds decisions and an automatic Anchor/Glory builder.

## Phase 4 — Chronological diagnostic implementation (Nov 24, 2026)

**User-facing page:** `/nfl/validation` with read-only `/api/nfl/validation`.

**Implemented:** Verified nflverse historical fixture reconstruction, strict game-week input isolation,
held-out scoring with Brier score / log loss / expected calibration error (ECE),
a prior-hit-rate baseline, monotone regularized calibration fitted ONLY on training weeks,
market-level sample counts and explicit production deployment gating.

**Initial 2026 diagnostic snapshot:** From 31 eligible historical games, 299 graded eligible
alternate prop selections were obtained. Weeks **7–8** trained an aggregate research
mapping (156 examples); Weeks **9–10** were held out (143 examples). Held-out Brier:
raw model **0.2128**, historical-hit-rate baseline **0.2319**, regularized aggregate
research mapping **0.2092**. Raw ECE **0.0748**, mapped ECE **0.0557**.
These are descriptive retrospective replay findings, NOT prospective verified odds.

**Why research-only:** Sample size is limited, per-market calibration cohorts are too thin
for individual approval, the data may include after-the-fact corrections, no truly
frozen pregame snapshots were available, and historical Vegas spreads/totals,
official inactives, route participation and weather were not reconstructed.
Thus `deploymentGate: RESEARCH_ONLY` is hard-coded. The live `/nfl` model
continues to display raw uncalibrated research estimates; no fair odds or
automatic Glory selection is enabled.

**Next:** Add 2023–2025 season archives to the walk-forward evaluation, then
separately reserve 2026 forward predictions, add historical lines/market signals,
evaluate by player position and prop market with minimum cohort thresholds, and
only promote mappings if they outperform uncalibrated and baseline models
out of sample across seasons with stable coverage.

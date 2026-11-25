# MIGO NFL Prospective Prediction Ledger

## Why it exists

Historical walk-forward results and live model probability estimates are not evidence of proven
profitable sportsbook pricing. To measure *genuine* prospective prediction quality, every
NFL research forecast must be saved **before kickoff** and graded later without rewriting
the forecast. This archive is the source for that analysis.

## Snapshot process

- GitHub Actions workflow: `.github/workflows/nfl-prospective.yml`
- Schedule: every four hours plus manual `workflow_dispatch`.
- Forecast source: public `https://migobetting.vercel.app/api/nfl`.
- Archive branch: `nfl-prospective-data`, separate from production `main`.
- Two windows, each saved at most once per fixture:
  - `early`: 18–120 hours before kickoff
  - `pregame`: 30 minutes–18 hours before kickoff
- Filename: `data/nfl/pregame/<season>/week-<week>/<eventId>__<window>.json`.
- The script checks the actual captured timestamp is **strictly before** the verified
  kickoff. It does not rewrite existing filenames and includes model version, kickoff
  timestamp, injury source coverage, player candidates, game markets, simulation output,
  and a SHA-256 record hash.
- The GitHub commit history records archive creation. These files should never be
  rebased or force-pushed.

## Final result grading

- The grader reads finalized `schedules/games.csv` and
  `stats_player_week_<season>.csv` from the nflverse public releases.
- It requires a unique completed matchup for the right season, week and teams
  **and** final player-stat rows from both teams.
- Each game outcome (moneyline, spread and total) and player stat (yardage,
  receptions, touchdowns) is matched to its frozen market threshold.
- A player with no unique final stat row, missing column, or DNP is **unknown**,
  not automatically a losing zero; market push/draw handling is also unknown.
- Grade files are created once as `__early__grade.json` or
  `__pregame__grade.json`; forecasts remain unchanged.
- The result includes individual Brier contributions where a **raw in-model**
  probability was archived. It does **not** claim a calibrated fair sportsbook
  price or net profitability. Multiple thresholds on one game are correlated.

## Monitoring and failure behavior

- Source outages and missing reports cause a visible Action log warning.
- Capture and grading run only on supported current-season fixtures returned
  by the official schedule API; no post-kickoff snapshots are permitted.
- Grading may happen days later if the nflverse release is delayed.
- Public GitHub workflow execution and write permissions must remain enabled.
- This is **not a live bet placement workflow**.
- The archive branch must be protected against manual rewriting; the script
  itself enforces file immutability, but a repository administrator can still
  force-push or delete history unless GitHub rules prohibit it.

## Reading the calibration dashboard

The game-market backtest trained on 2023–2025 and evaluated 2026 on historical
week-based replays. The player-prop retrospective uses much smaller samples by
market, especially quarterback passing yards and passing touchdowns. The
prospective ledger adds independently timestamped predictions to establish
what the model actually said before kickoff. Market-level calibration must be
measured across weeks/seasons with confidence intervals and player/team
cluster-aware scoring before promotion to a bet-value engine.

Note: candidate-generation thresholds were revised after the first frozen
CHI@DET Week 12 `early` snapshot. The archive preserves the **older**
production model forecast. Later `pregame` snapshots will capture the updated
model only after a verified production deployment. Never relabel old records.

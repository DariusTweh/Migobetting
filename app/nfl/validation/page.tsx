import { NflValidationDashboard } from "@/components/nfl-validation-dashboard";
import { NflGameValidationPanel } from "@/components/nfl-game-validation-panel";
import Link from "next/link";
import "../nfl.css";
import "../pro.css";
export const metadata = {
  title: "NFL Walk-Forward Validation | MIGO Betting",
  description: "Historical out-of-sample diagnostic results for the MIGO NFL research model.",
};
export default function NflValidationPage() {
  return <>
    <NflValidationDashboard/>
    <div className="nm-app">
      <NflGameValidationPanel/>
      <section className="nm-card" style={{marginTop:20}}>
        <div className="nm-card-head"><div><h3>Prospective prediction ledger</h3>
          <span>Forecasts frozen before kickoff · independent result verification</span></div>
          <span className="nm-stat-label">NO HINDSIGHT</span>
        </div>
        <p className="nm-detail-note">
          A scheduled GitHub job archives early and pregame NFL forecasts without overwriting them.
          Final scores and NFL player outcomes are graded only after authoritative weekly records
          become available. Missing player statistics remain unknown, never automatic losses.
        </p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",padding:"0 19px 17px"}}>
          <Link className="nm-link-outline" href="https://github.com/DariusTweh/Migobetting/tree/nfl-prospective-data/data/nfl/pregame">
            View frozen forecasts
          </Link>
          <Link className="nm-link-outline" href="https://github.com/DariusTweh/Migobetting/actions/workflows/nfl-prospective.yml">
            See capture and grading runs
          </Link>
        </div>
      </section>
    </div>
  </>;
}

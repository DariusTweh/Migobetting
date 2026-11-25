import { NflValidationDashboard } from "@/components/nfl-validation-dashboard";
import { NflGameValidationPanel } from "@/components/nfl-game-validation-panel";
import "../nfl.css";
import "../pro.css";
export const metadata = {
  title: "NFL Walk-Forward Validation | MIGO Betting",
  description: "Historical out-of-sample diagnostic results for the MIGO NFL research model.",
};
export default function NflValidationPage() {
  return <><NflValidationDashboard/><div className="nm-app"><NflGameValidationPanel/></div></>;
}

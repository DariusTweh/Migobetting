"use client";

import { useEffect, useState } from "react";
import { Check, HardDrive, RotateCcw } from "lucide-react";
import { getBankroll, resetLocalData, setBankroll } from "./local-storage";
import { Notice, PageHeader, Panel, PanelHead } from "./ui";
import { LEAGUES } from "@/lib/leagues";

export function SettingsPanel() {
  const [bankroll, updateBankroll] = useState(1000);
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState(false);
  useEffect(() => updateBankroll(getBankroll()), []);
  function save() { setBankroll(bankroll); setSaved(true); setTimeout(() => setSaved(false), 1800); }
  function clear() { resetLocalData(); updateBankroll(1000); setReset(true); setTimeout(() => setReset(false), 1800); }
  return <>
    <PageHeader eyebrow="Local configuration" title="Settings" description="Control the workspace without an account, Supabase project, or cloud-synced profile." />
    <div className="settings-grid">
      <div className="stack">
        <Panel>
          <PanelHead title="Paper bankroll" meta="Stored in localStorage" />
          <div className="settings-body"><div className="field"><label>Starting virtual bankroll</label><div className="money-input"><span>$</span><input className="input" type="number" min="1" value={bankroll} onChange={(event) => updateBankroll(Number(event.target.value))} /></div><small>Used for simulation and sizing only.</small></div><button className="button button-primary" onClick={save}>{saved ? <Check size={16} /> : null}{saved ? "Saved" : "Save locally"}</button></div>
        </Panel>
        <Panel>
          <PanelHead title="Preferred competitions" meta="All enabled by default" />
          <div className="league-settings">{LEAGUES.map((league) => <label key={league.id}><input type="checkbox" defaultChecked /><span><strong>{league.name}</strong><small>{league.id}</small></span></label>)}</div>
        </Panel>
      </div>
      <div className="stack">
        <Panel>
          <PanelHead title="Data architecture" meta="Current foundation" />
          <div className="architecture-list"><div><HardDrive size={18} /><span><strong>Browser-local user data</strong><small>Paper bets, bankroll, and preferences</small></span><b>ACTIVE</b></div><div><HardDrive size={18} /><span><strong>Next.js provider cache</strong><small>Live ESPN responses · 5 minutes</small></span><b>ACTIVE</b></div><div className="disabled"><HardDrive size={18} /><span><strong>Supabase / authentication</strong><small>Explicitly deferred</small></span><b>OFF</b></div></div>
        </Panel>
        <Panel>
          <PanelHead title="Reset workspace" meta="This cannot be undone in this browser" />
          <div className="settings-body"><p className="muted-copy">Remove paper selections, bankroll settings, and preferences stored by MIGO on this device.</p><button className="button button-danger" onClick={clear}><RotateCcw size={15} />{reset ? "Local data cleared" : "Clear local data"}</button></div>
        </Panel>
        <Notice>There is no account recovery or cross-device sync in local mode. Clearing browser storage removes the local paper ledger.</Notice>
      </div>
    </div>
  </>;
}

"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, LoaderCircle, ShieldAlert, Sparkles } from "lucide-react";
import type { AIAnalysisResponse } from "@/lib/ai-analysis";

const PASS_KEY = "migo:ai:access:v1";

export function AIReasoning({
  kind, context, fingerprint,
}: {
  kind: "fixture" | "parlay";
  context: Record<string, unknown>;
  fingerprint: string;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [analysis, setAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try { setPassphrase(sessionStorage.getItem(PASS_KEY) ?? ""); } catch { /* private browser mode */ }
  }, []);
  useEffect(() => { setAnalysis(null); setError(""); }, [fingerprint]);

  async function analyze() {
    if (busy) return;
    const access = passphrase.trim();
    if (access.length < 16) {
      setError("Enter your private MIGO access passphrase (16+ characters), not the OpenAI API key.");
      return;
    }
    setBusy(true); setError(""); setAnalysis(null);
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "x-migo-ai-access": access },
        body: JSON.stringify({ kind, context }),
      });
      const data: { error?: string; analysis?: AIAnalysisResponse["analysis"]; model?: string; inputTokens?: number | null; outputTokens?: number | null } = await response.json();
      if (!response.ok || !data.analysis || !data.model) throw new Error(data.error ?? "Reasoning request failed");
      setAnalysis({
        analysis: data.analysis, model: data.model,
        inputTokens: data.inputTokens ?? null, outputTokens: data.outputTokens ?? null,
      });
      try { sessionStorage.setItem(PASS_KEY, access); } catch { /* optional tab-level convenience */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach MIGO AI");
    } finally { setBusy(false); }
  }

  return <section className="migo-ai-panel" aria-label={"MIGO AI " + kind + " reasoning"}>
    <div className="migo-ai-head">
      <div><BrainCircuit size={19} /><strong>MIGO AI · Evidence Audit</strong></div>
      <span>OpenAI reasoning · on demand</span>
    </div>
    <p className="migo-ai-info">
      Reviews {kind === "fixture" ? "the numerical model, score ranges, evidence and lineup uncertainty" :
        "these quoted odds, model edge estimates, missing information and combined-ticket risk"}.
      It does not change probabilities, select different legs, place bets or fetch independent injury news.
    </p>
    {!analysis ? <div className="migo-ai-actions">
      <label className="migo-ai-access">
        <span>Private MIGO access passphrase</span>
        <input className="input" type="password" autoComplete="off" placeholder="Not your OpenAI API key"
          value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
      </label>
      <button className="button button-primary" disabled={busy} onClick={() => void analyze()}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
        {busy ? "Reasoning over evidence…" : "Analyze with OpenAI"}
      </button>
    </div> : <div className="migo-ai-result">
      <div className="migo-ai-verdict">
        <span className={"badge " + (analysis.analysis.verdict === "PASS" ? "badge-insufficient" : "badge-limited")}>
          {analysis.analysis.verdict}
        </span>
        <strong>{analysis.analysis.headline}</strong>
      </div>
      <div className="migo-ai-columns">
        <div><strong>Evidence considered</strong>
          {analysis.analysis.evidence.map((item, index) => <p key={index}>{item}</p>)}
        </div>
        <div><strong>Risk and uncertainty</strong>
          {analysis.analysis.risks.map((item, index) => <p key={index}>{item}</p>)}
        </div>
      </div>
      {analysis.analysis.missingData.length > 0 ? <div className="migo-ai-missing">
        <ShieldAlert size={15} /><span>Missing: {analysis.analysis.missingData.join(" · ")}</span>
      </div> : null}
      <p className="migo-ai-conclusion">{analysis.analysis.conclusion}</p>
      <div className="migo-ai-foot">
        <small>{analysis.model} · {analysis.inputTokens ?? "—"} input / {analysis.outputTokens ?? "—"} output tokens · API-billed</small>
        <button className="button" onClick={() => void analyze()} disabled={busy}>
          {busy ? "Analyzing…" : "Refresh AI audit"}
        </button>
      </div>
    </div>}
    {error ? <div className="migo-ai-error" role="alert"><ShieldAlert size={14}/><span>{error}</span></div> : null}
    <small className="migo-ai-disclaimer">Only press Analyze when needed; each request uses paid API tokens. The access passphrase remains in this browser tab only, and is separate from the server-side OpenAI key.</small>
  </section>;
}

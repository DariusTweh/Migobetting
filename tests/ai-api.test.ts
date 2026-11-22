import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/ai/analyze/route";

const passphrase = "private-migo-passphrase-123456789";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const request = (token: string, kind: "fixture" | "parlay" = "fixture") => new NextRequest(
  "https://example.test/api/ai/analyze", {
    method: "POST",
    headers: { "x-migo-ai-access": token, "Content-Type": "application/json" },
    body: JSON.stringify({ kind, context: { analysisType: kind, model: { homeWin: 0.52 } } }),
  },
);

describe("cost-protected MIGO OpenAI API endpoint", () => {
  it("never exposes server OpenAI credentials in GET status", async () => {
    vi.stubEnv("OPENAI_API_KEY", "top-secret-openai-key");
    vi.stubEnv("MIGO_AI_ACCESS_TOKEN", passphrase);
    const response = await GET();
    const text = await response.text();
    expect(text).toContain('"available":true');
    expect(text).not.toContain("top-secret-openai-key");
    expect(text).not.toContain(passphrase);
  });
  it("fails closed if the access passphrase is missing or incorrect", async () => {
    vi.stubEnv("OPENAI_API_KEY", "top-secret-openai-key");
    vi.stubEnv("MIGO_AI_ACCESS_TOKEN", passphrase);
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    expect((await POST(request("wrong-access"))).status).toBe(401);
    expect(fake).not.toHaveBeenCalled();
  });
  it("requires both separate secrets before allowing any paid model request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("MIGO_AI_ACCESS_TOKEN", passphrase);
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    expect((await POST(request(passphrase))).status).toBe(503);
    expect(fake).not.toHaveBeenCalled();
  });
  it("calls the server-only Responses API with no storage and strict structured output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "top-secret-openai-key");
    vi.stubEnv("MIGO_AI_ACCESS_TOKEN", passphrase);
    vi.stubEnv("OPENAI_MODEL", "gpt-6.1-sol");
    const analysis = {
      verdict: "CAUTION", headline: "Limited sample",
      evidence: ["Recorded probabilities are uncalibrated"],
      risks: ["Unknown lineup"],
      missingData: ["Confirmed team news"],
      conclusion: "Cannot establish sportsbook value without real odds.",
    };
    const mock = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(analysis) }] }],
      usage: { input_tokens: 321, output_tokens: 123 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", mock);
    const response = await POST(request(passphrase));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.analysis.verdict).toBe("CAUTION");
    expect(body.inputTokens).toBe(321);
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options?.headers).toHaveProperty("Authorization", "Bearer top-secret-openai-key");
    const upstream = JSON.parse(String(options?.body)) as Record<string, unknown>;
    expect(upstream.store).toBe(false);
    expect((upstream.text as { format: { strict: boolean } }).format.strict).toBe(true);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

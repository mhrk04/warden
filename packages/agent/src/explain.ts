/**
 * Natural-language explanation layer (Requirement 9.1-9.3, TC-001-15/16, EC-001-7).
 *
 * `explain` turns an outcome into a plain-language string. When an LLM key is
 * configured it asks Gemini for the wording; when the key is absent OR the call
 * fails/times out/429s, it returns a deterministic TEMPLATE. Either way it
 * ALWAYS returns a string and NEVER throws.
 *
 * SECURITY INVARIANT (failure mode 10): this module is money-path-free. It does
 * not import propose/signer, never signs, never encodes a transaction, and never
 * feeds its output back into any execution decision. All money-affecting
 * decisions come from the deterministic rule (decide) + the on-chain Guard. The
 * LLM output is display text only.
 */

type Hex = `0x${string}` | string;

export interface Outcome {
  outcome: "executed" | "rejected";
  /** Reject reason code (1..6); present when outcome === "rejected". */
  reason?: number;
  amount?: bigint;
  recipient?: Hex;
  txHash?: Hex;
}

export interface ExplainOptions {
  /** LLM API key; defaults to env LLM_API_KEY. When absent, template is used. */
  apiKey?: string;
  /** Provider selector (only "gemini" is implemented; anything else falls back). */
  provider?: string;
  /** Gemini model name; defaults to env LLM_MODEL or "gemini-flash-latest". */
  model?: string;
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  /** Request timeout in ms (default 8000). */
  timeoutMs?: number;
}

/** reason code -> human phrase (Requirement 9.1). */
const REASON_TEXT: Record<number, string> = {
  1: "the payout exceeded the per-transaction limit",
  2: "the payout would exceed the cumulative spend limit",
  3: "the recipient is not on the allowlist",
  4: "the agent's authorization has expired",
  5: "the agent has been revoked",
  6: "the caller is not the authorized agent signer",
};

/**
 * Deterministic template explanation. Pure, no I/O, always a non-empty string.
 */
export function templateExplanation(o: Outcome): string {
  if (o.outcome === "executed") {
    const amount = o.amount !== undefined ? o.amount.toString() : "the requested amount";
    const to = o.recipient ? ` to ${o.recipient}` : "";
    const tx = o.txHash ? ` (tx ${o.txHash})` : "";
    return `Executed: the Guard approved and paid out ${amount} test-USDC${to}${tx}.`;
  }
  const code = o.reason ?? 0;
  const why = REASON_TEXT[code] ?? "the proposal did not meet the on-chain policy";
  return `Rejected: the Guard blocked this payout because ${why} (reason code ${code}).`;
}

/** Build the prompt fed to the LLM (display wording only — never parsed back). */
function buildPrompt(o: Outcome): string {
  const facts = templateExplanation(o);
  return (
    "You are explaining, in one or two plain-language sentences for a non-technical " +
    "operator, the outcome of an on-chain agent payment. Do NOT invent numbers; only " +
    "restate these facts clearly:\n" +
    facts
  );
}

/** Extract Gemini's text from a v1beta generateContent response, or null. */
function parseGemini(body: unknown): string | null {
  const b = body as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = b?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" && text.trim().length > 0 ? text : null;
}

/**
 * Produce a plain-language explanation. LLM when a key is present; deterministic
 * template otherwise or on any failure. Never throws, always returns a string.
 */
export async function explain(o: Outcome, opts: ExplainOptions = {}): Promise<string> {
  const apiKey = opts.apiKey ?? process.env.LLM_API_KEY;

  // No key -> deterministic template (Requirement 9.2).
  if (!apiKey) return templateExplanation(o);

  const doFetch = opts.fetchImpl ?? (globalThis.fetch as unknown as ExplainOptions["fetchImpl"]);
  if (!doFetch) return templateExplanation(o);

  const model = opts.model ?? process.env.LLM_MODEL ?? "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(o) }] }],
      }),
    });

    if (!res.ok) return templateExplanation(o); // 429 / 5xx / etc -> fallback (EC-001-7)

    const text = parseGemini(await res.json());
    return text ?? templateExplanation(o);
  } catch {
    // network error / timeout -> fallback, never throw
    return templateExplanation(o);
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { VerifyGate } from "./VerifyGate";

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.body,
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("VerifyGate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading skeleton while reading the session", () => {
    // fetch never resolves during this synchronous assertion
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <VerifyGate>
        <div>protected create</div>
      </VerifyGate>,
    );
    expect(screen.getByLabelText(/checking verification/i)).toBeInTheDocument();
  });

  it("BLOCKS the protected children and shows the World verify CTA when unverified", async () => {
    mockFetchSequence([{ ok: true, body: { verified: false } }]);
    render(
      <VerifyGate>
        <div>protected create</div>
      </VerifyGate>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /selfie check/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText("protected create")).not.toBeInTheDocument();
  });

  it("shows the protected children when the server session is verified", async () => {
    mockFetchSequence([{ ok: true, body: { verified: true } }]);
    render(
      <VerifyGate>
        <div>protected create</div>
      </VerifyGate>,
    );
    await waitFor(() => expect(screen.getByText("protected create")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /selfie check/i })).not.toBeInTheDocument();
  });

  it("shows an error state with retry when the session check fails", async () => {
    mockFetchSequence([{ ok: false, status: 500, body: { error: "boom" } }]);
    render(
      <VerifyGate>
        <div>protected create</div>
      </VerifyGate>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument(),
    );
  });

  it("posts a proof to the callback and reveals children once the SERVER confirms verified", async () => {
    const fetchFn = mockFetchSequence([
      { ok: true, body: { verified: false } }, // initial session
      { ok: true, body: { verified: true } }, // callback POST
      { ok: true, body: { verified: true } }, // re-read session
    ]);
    render(
      <VerifyGate>
        <div>protected create</div>
      </VerifyGate>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /selfie check/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /selfie check/i }));
    await waitFor(() => expect(screen.getByText("protected create")).toBeInTheDocument());

    // The callback must have been POSTed (server is the gate, not client state).
    const calledCallback = fetchFn.mock.calls.some(
      (c) => String(c[0]).includes("/api/verify/callback") && c[1]?.method === "POST",
    );
    expect(calledCallback).toBe(true);
  });
});

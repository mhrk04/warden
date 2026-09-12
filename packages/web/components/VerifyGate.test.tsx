import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VerifyGate } from "./VerifyGate";

// Mock the IDKit v4 widget: it's a controlled component (no render-prop), so we
// render nothing — the gate's own "Verify with World" button drives the flow.
// proofOfHuman() returns an opaque preset object; a stub is fine for unit tests.
vi.mock("@worldcoin/idkit", () => ({
  IDKitRequestWidget: () => null,
  proofOfHuman: () => ({ preset: "proofOfHuman" }),
}));

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
    // The widget only renders when an app id is configured.
    vi.stubEnv("NEXT_PUBLIC_WORLD_APP_ID", "app_test123");
    vi.stubEnv("NEXT_PUBLIC_WORLD_ACTION", "create-agent");
    vi.stubEnv("NEXT_PUBLIC_WLD_ENVIRONMENT", "staging");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shows a loading skeleton while reading the session", () => {
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
    // The gate shows the verify card and BLOCKS the protected children until the
    // SERVER confirms verified (the World CTA button renders when app id is configured).
    await waitFor(() =>
      expect(screen.getByText(/verify to create agents/i)).toBeInTheDocument(),
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
    expect(
      screen.queryByRole("button", { name: /verify with world/i }),
    ).not.toBeInTheDocument();
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
});

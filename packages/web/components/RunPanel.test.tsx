import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RunPanel } from "./RunPanel";

function stubFetch(fn: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fn);
}

describe("RunPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders an empty state before any run", () => {
    render(<RunPanel node="0xabc" onRan={() => {}} />);
    expect(screen.getByText(/no run yet/i)).toBeInTheDocument();
  });

  it("shows a loading state while the run is in flight", async () => {
    let resolve!: (v: unknown) => void;
    stubFetch(vi.fn().mockReturnValue(new Promise((r) => (resolve = r))));
    render(<RunPanel node="0xabc" onRan={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /run agent/i }));
    await waitFor(() => expect(screen.getByLabelText(/running/i)).toBeInTheDocument());
    resolve({ ok: true, status: 200, json: async () => ({ outcome: "executed", explanation: "x" }) });
  });

  it("renders an Executed outcome with a success badge, txHash link and explanation", async () => {
    stubFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          outcome: "executed",
          txHash: "0xdeadbeef",
          explanation: "Paid 20 tUSDC to the allowlisted recipient.",
        }),
      }),
    );
    render(<RunPanel node="0xabc" onRan={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /run agent/i }));

    await waitFor(() => expect(screen.getByText(/executed/i)).toBeInTheDocument());
    expect(screen.getByText(/Paid 20 tUSDC/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /0xdeadbeef|view on etherscan|transaction/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("sepolia.etherscan.io/tx/0xdeadbeef"));
  });

  it("renders a Rejected outcome with the reason and explanation", async () => {
    stubFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          outcome: "rejected",
          reason: 1,
          explanation: "The payout exceeded the per-transaction cap.",
        }),
      }),
    );
    render(<RunPanel node="0xabc" onRan={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /run agent/i }));

    await waitFor(() => expect(screen.getByText(/rejected/i)).toBeInTheDocument());
    expect(screen.getByText(/per-transaction limit/i)).toBeInTheDocument();
    expect(screen.getByText(/exceeded the per-transaction cap/i)).toBeInTheDocument();
  });

  it("renders an error state when the request fails", async () => {
    stubFetch(vi.fn().mockRejectedValue(new Error("network down")));
    render(<RunPanel node="0xabc" onRan={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /run agent/i }));
    await waitFor(() => expect(screen.getByText(/couldn.t run/i)).toBeInTheDocument());
  });
});

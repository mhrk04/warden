import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentCard } from "./AgentCard";
import type { Agent } from "@/lib/agents";

const baseAgent: Agent = {
  ensName: "payer.warden.eth",
  ensNode: "0xabc",
  agentSigner: "0x1234567890abcdef1234567890abcdef12345678",
  perTxCap: "50000000", // 50 tUSDC
  cumulativeCap: "500000000", // 500 tUSDC
  spent: "125000000", // 125 tUSDC
  expiry: String(Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60), // ~3 days out
  revoked: false,
};

describe("AgentCard", () => {
  it("renders the ENS name in mono and the shortened signer", () => {
    render(<AgentCard agent={baseAgent} onRun={() => {}} onRevoked={() => {}} />);
    expect(screen.getByText("payer.warden.eth")).toBeInTheDocument();
    expect(screen.getByText(/0x1234…5678/)).toBeInTheDocument();
  });

  it("renders the per-tx cap, cumulative cap and formatted spend", () => {
    render(<AgentCard agent={baseAgent} onRun={() => {}} onRevoked={() => {}} />);
    // per-tx cap 50, cumulative 500, spent 125 (all tUSDC)
    expect(screen.getByText(/50 tUSDC/)).toBeInTheDocument();
    expect(screen.getByText(/125 \/ 500 tUSDC/)).toBeInTheDocument();
  });

  it("renders a cumulative-spend progress bar reflecting spent vs cap", () => {
    render(<AgentCard agent={baseAgent} onRun={() => {}} onRevoked={() => {}} />);
    const bar = screen.getByRole("progressbar", { name: /cumulative spend/i });
    // 125/500 = 25
    expect(bar).toHaveAttribute("aria-valuenow", "125");
    expect(bar).toHaveAttribute("aria-valuemax", "500");
  });

  it("renders an expiry countdown", () => {
    render(<AgentCard agent={baseAgent} onRun={() => {}} onRevoked={() => {}} />);
    expect(screen.getByText(/expires in/i)).toBeInTheDocument();
  });

  it("shows an Expired badge when past expiry", () => {
    const expired = { ...baseAgent, expiry: String(Math.floor(Date.now() / 1000) - 100) };
    render(<AgentCard agent={expired} onRun={() => {}} onRevoked={() => {}} />);
    expect(screen.getAllByText(/expired/i).length).toBeGreaterThan(0);
    // Run is disabled once expired.
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
  });

  it("fires onRun with the node when Run is clicked", () => {
    const onRun = vi.fn();
    render(<AgentCard agent={baseAgent} onRun={onRun} onRevoked={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    expect(onRun).toHaveBeenCalledWith("0xabc");
  });

  it("disables Run and shows a Revoked badge for revoked agents", () => {
    const revoked = { ...baseAgent, revoked: true };
    render(<AgentCard agent={revoked} onRun={() => {}} onRevoked={() => {}} />);
    expect(screen.getByText(/revoked/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
  });

  it("uses no inline styles", () => {
    const { container } = render(
      <AgentCard agent={baseAgent} onRun={() => {}} onRevoked={() => {}} />,
    );
    expect(container.querySelectorAll("[style]").length).toBe(0);
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentList } from "./AgentList";
import type { Agent } from "@/lib/agents";

const agent: Agent = {
  ensName: "payer.warden.eth",
  ensNode: "0xabc",
  agentSigner: "0x1234567890abcdef1234567890abcdef12345678",
  perTxCap: "50000000",
  cumulativeCap: "500000000",
  spent: "0",
  expiry: "4102444800",
  revoked: false,
};

describe("AgentList", () => {
  it("renders a loading skeleton when loading", () => {
    render(<AgentList agents={[]} loading onSelect={() => {}} selected={null} />);
    expect(screen.getByLabelText(/loading agents/i)).toBeInTheDocument();
  });

  it("renders an error state with retry", () => {
    const onRetry = vi.fn();
    render(
      <AgentList agents={[]} error="failed" onRetry={onRetry} onSelect={() => {}} selected={null} />,
    );
    expect(screen.getByText(/failed to load agents/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders a friendly empty state when there are no agents", () => {
    render(<AgentList agents={[]} onSelect={() => {}} selected={null} />);
    expect(screen.getByText(/no agents yet/i)).toBeInTheDocument();
  });

  it("lists agents by ENS name and fires onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<AgentList agents={[agent]} onSelect={onSelect} selected={null} />);
    const item = screen.getByText("payer.warden.eth");
    expect(item).toBeInTheDocument();
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith("0xabc");
  });
});

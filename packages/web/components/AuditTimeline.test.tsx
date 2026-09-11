import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuditTimeline } from "./AuditTimeline";
import type { AuditEvent } from "@/lib/audit";

function stubFetch(fn: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fn);
}

const events: AuditEvent[] = [
  {
    id: "1",
    ensNode: "0xabc",
    kind: "AgentConfigured",
    txHash: "0xhash1",
    blockTimestamp: "1700000000",
  },
  {
    id: "2",
    ensNode: "0xabc",
    kind: "Executed",
    to: "0x1111111111111111111111111111111111111111",
    amount: "20000000",
    newSpent: "20000000",
    txHash: "0xhash2",
    blockTimestamp: "1700000100",
  },
  {
    id: "3",
    ensNode: "0xabc",
    kind: "PolicyChanged",
    txHash: "0xhash3",
    blockTimestamp: "1700000200",
  },
  {
    id: "4",
    ensNode: "0xabc",
    kind: "Revoked",
    txHash: "0xhash4",
    blockTimestamp: "1700000300",
  },
];

describe("AuditTimeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a loading skeleton while fetching", () => {
    stubFetch(vi.fn(() => new Promise(() => {})));
    render(<AuditTimeline node="0xabc" ensName="payer.warden.eth" />);
    expect(screen.getByLabelText(/loading activity/i)).toBeInTheDocument();
  });

  it("renders events by kind with the ENS name header and etherscan links", async () => {
    stubFetch(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => events }));
    render(<AuditTimeline node="0xabc" ensName="payer.warden.eth" />);

    await waitFor(() => expect(screen.getByText("Executed")).toBeInTheDocument());
    // ENS name header
    expect(screen.getByText(/payer\.warden\.eth/)).toBeInTheDocument();
    expect(screen.getByText("AgentConfigured")).toBeInTheDocument();
    expect(screen.getByText("PolicyChanged")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();

    // Executed row shows amount + to, and links txHash to sepolia etherscan.
    const link = screen.getByRole("link", { name: /0xhash2/ });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("sepolia.etherscan.io/tx/0xhash2"),
    );
  });

  it("renders an empty state when there is no activity", async () => {
    stubFetch(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
    render(<AuditTimeline node="0xabc" ensName="payer.warden.eth" />);
    await waitFor(() => expect(screen.getByText(/no activity yet/i)).toBeInTheDocument());
  });

  it("renders an error state with retry on failure", async () => {
    stubFetch(vi.fn().mockRejectedValue(new Error("boom")));
    render(<AuditTimeline node="0xabc" ensName="payer.warden.eth" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument(),
    );
  });

  it("refetches when the refreshKey changes", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    stubFetch(fetchFn);
    const { rerender } = render(
      <AuditTimeline node="0xabc" ensName="payer.warden.eth" refreshKey={0} />,
    );
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    rerender(<AuditTimeline node="0xabc" ensName="payer.warden.eth" refreshKey={1} />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RevokeButton } from "./RevokeButton";

function stubFetch(fn: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fn);
}

describe("RevokeButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a destructive Revoke button", () => {
    render(<RevokeButton node="0xabc" onRevoked={() => {}} />);
    const btn = screen.getByRole("button", { name: /revoke/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("bg-danger");
  });

  it("opens a confirm dialog before revoking (does not call the endpoint yet)", () => {
    const fetchFn = vi.fn();
    stubFetch(fetchFn);
    render(<RevokeButton node="0xabc" onRevoked={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/permanently revokes/i)).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("POSTs the revoke endpoint on confirm and calls onRevoked", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    stubFetch(fetchFn);
    const onRevoked = vi.fn();
    render(<RevokeButton node="0xabc" onRevoked={onRevoked} />);
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm|yes, revoke/i }));

    await waitFor(() => expect(onRevoked).toHaveBeenCalledWith("0xabc"));
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/api/agents/0xabc/revoke");
    expect(init.method).toBe("POST");
  });

  it("shows an error in the dialog when the revoke fails", async () => {
    stubFetch(vi.fn().mockRejectedValue(new Error("nope")));
    render(<RevokeButton node="0xabc" onRevoked={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm|yes, revoke/i }));
    await waitFor(() => expect(screen.getByText(/couldn.t revoke/i)).toBeInTheDocument());
  });

  it("is disabled when already revoked", () => {
    render(<RevokeButton node="0xabc" onRevoked={() => {}} revoked />);
    expect(screen.getByRole("button", { name: /revoked/i })).toBeDisabled();
  });
});

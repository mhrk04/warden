import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateAgentDialog } from "./CreateAgentDialog";

function stubFetch(fn: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fn);
}

const fillValidForm = () => {
  fireEvent.change(screen.getByLabelText(/label/i), { target: { value: "payer" } });
  fireEvent.change(screen.getByLabelText(/per-transaction cap/i), { target: { value: "50" } });
  fireEvent.change(screen.getByLabelText(/cumulative cap/i), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText(/expiry/i), { target: { value: "2099-01-01" } });
  fireEvent.change(screen.getByLabelText(/allowlist/i), {
    target: { value: "0x1111111111111111111111111111111111111111" },
  });
};

describe("CreateAgentDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not render when closed", () => {
    render(<CreateAgentDialog open={false} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the form fields when open", () => {
    render(<CreateAgentDialog open onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/label/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/per-transaction cap/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cumulative cap/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/expiry/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allowlist/i)).toBeInTheDocument();
  });

  it("blocks submit and shows validation when required fields are empty", async () => {
    const fetchFn = vi.fn();
    stubFetch(fetchFn);
    render(<CreateAgentDialog open onClose={() => {}} onCreated={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /create agent/i }));
    await waitFor(() => expect(screen.getByText(/label is required/i)).toBeInTheDocument());
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("submits POST /api/agents and calls onCreated + onClose on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ensName: "payer.warden.eth", ensNode: "0xabc" }),
    });
    stubFetch(fetchFn);
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<CreateAgentDialog open onClose={onClose} onCreated={onCreated} />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /create agent/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalled();
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/api/agents");
    expect(init.method).toBe("POST");
  });

  it("shows a verify-first message on 403", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "verification required" }),
    });
    stubFetch(fetchFn);
    render(<CreateAgentDialog open onClose={() => {}} onCreated={() => {}} />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /create agent/i }));
    await waitFor(() => expect(screen.getByText(/verify first/i)).toBeInTheDocument());
  });

  it("disables the submit button while the request is pending", async () => {
    let resolve!: (v: unknown) => void;
    const fetchFn = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    stubFetch(fetchFn);
    render(<CreateAgentDialog open onClose={() => {}} onCreated={() => {}} />);
    fillValidForm();
    const submit = screen.getByRole("button", { name: /create agent/i });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    resolve({ ok: true, status: 200, json: async () => ({ ensName: "x", ensNode: "0x1" }) });
  });
});

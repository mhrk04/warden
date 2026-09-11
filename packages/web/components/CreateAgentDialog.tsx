"use client";
import { useState } from "react";
import { Plus, LoaderCircle } from "lucide-react";
import { createAgentReq, ApiError } from "@/lib/api";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Toast } from "./ui/Toast";

export interface CreateAgentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create so the parent can refresh the list. */
  onCreated: () => void;
}

/** Parse "50" tUSDC (6 decimals) into base units as a decimal string. */
function toBaseUnits(human: string): string {
  const [whole, frac = ""] = human.trim().split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return (BigInt(whole || "0") * 1_000_000n + BigInt(fracPadded || "0")).toString();
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export function CreateAgentDialog({ open, onClose, onCreated }: CreateAgentDialogProps) {
  const [label, setLabel] = useState("");
  const [perTxCap, setPerTxCap] = useState("");
  const [cumulativeCap, setCumulativeCap] = useState("");
  const [expiry, setExpiry] = useState("");
  const [allowlist, setAllowlist] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setLabel("");
    setPerTxCap("");
    setCumulativeCap("");
    setExpiry("");
    setAllowlist("");
    setErrors({});
    setFormError(null);
  };

  const validate = (): { ok: boolean; addresses: string[] } => {
    const next: Record<string, string> = {};
    if (!label.trim()) next.label = "Label is required";
    else if (!/^[a-z0-9-]+$/.test(label.trim()))
      next.label = "Use lowercase letters, numbers and hyphens only";
    if (!perTxCap.trim() || Number(perTxCap) <= 0)
      next.perTxCap = "Per-transaction cap must be greater than 0";
    if (!cumulativeCap.trim() || Number(cumulativeCap) <= 0)
      next.cumulativeCap = "Cumulative cap must be greater than 0";
    if (!expiry.trim()) next.expiry = "Expiry is required";

    const addresses = allowlist
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const badAddr = addresses.find((a) => !ADDR.test(a));
    if (badAddr) next.allowlist = `Not a valid address: ${badAddr}`;

    setErrors(next);
    return { ok: Object.keys(next).length === 0, addresses };
  };

  const submit = async () => {
    setFormError(null);
    const { ok, addresses } = validate();
    if (!ok) return;

    const expirySeconds = Math.floor(new Date(expiry).getTime() / 1000).toString();

    setPending(true);
    try {
      await createAgentReq({
        label: label.trim(),
        perTxCap: toBaseUnits(perTxCap),
        cumulativeCap: toBaseUnits(cumulativeCap),
        expiry: expirySeconds,
        allowlist: addresses,
      });
      reset();
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setFormError("You must verify first. Complete World Selfie Check before creating agents.");
      } else {
        setFormError(err instanceof Error ? err.message : "Failed to create agent");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create Agent"
      description="Set the on-chain spending scope this agent cannot exceed."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field id="label" label="Label" hint="agent name; becomes label.warden.eth" error={errors.label}>
          <input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="payer"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="perTxCap"
            label="Per-transaction cap"
            hint="tUSDC"
            error={errors.perTxCap}
          >
            <input
              id="perTxCap"
              inputMode="decimal"
              value={perTxCap}
              onChange={(e) => setPerTxCap(e.target.value)}
              placeholder="50"
              className={inputCls}
            />
          </Field>
          <Field id="cumulativeCap" label="Cumulative cap" hint="tUSDC" error={errors.cumulativeCap}>
            <input
              id="cumulativeCap"
              inputMode="decimal"
              value={cumulativeCap}
              onChange={(e) => setCumulativeCap(e.target.value)}
              placeholder="500"
              className={inputCls}
            />
          </Field>
        </div>

        <Field id="expiry" label="Expiry" hint="proposals after this revert" error={errors.expiry}>
          <input
            id="expiry"
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field
          id="allowlist"
          label="Allowlist"
          hint="comma-separated recipient addresses"
          error={errors.allowlist}
        >
          <input
            id="allowlist"
            value={allowlist}
            onChange={(e) => setAllowlist(e.target.value)}
            placeholder="0xabc..., 0xdef..."
            className={`${inputCls} font-mono`}
          />
        </Field>

        {formError ? <Toast message={formError} tone="error" /> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Create Agent
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-fg " +
  "placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {hint ? <span className="ml-2 text-xs font-normal text-muted">{hint}</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

import { CircleCheck, CircleX, TriangleAlert, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BadgeTone } from "./Badge";

export interface ToastProps {
  message: string;
  tone?: Extract<BadgeTone, "success" | "error" | "warning" | "info">;
  className?: string;
}

const toneStyles = {
  success: "border-success/40 bg-success/10 text-success",
  error: "border-danger/40 bg-danger/10 text-danger",
  warning: "border-warn/40 bg-warn/10 text-warn",
  info: "border-secondary/40 bg-secondary/10 text-secondary",
} as const;

const toneIcon = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
} as const;

/** A non-blocking status message. Uses role="status" for polite announcement. */
export function Toast({ message, tone = "info", className }: ToastProps) {
  const Icon = toneIcon[tone];
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        toneStyles[tone],
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

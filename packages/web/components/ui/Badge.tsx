import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "success" | "error" | "warning" | "neutral" | "info";

const tones: Record<BadgeTone, string> = {
  success: "bg-success/15 text-success border-success/30",
  error: "bg-danger/15 text-danger border-danger/30",
  warning: "bg-warn/15 text-warn border-warn/30",
  info: "bg-secondary/15 text-secondary border-secondary/30",
  neutral: "bg-elevated text-muted border-border",
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

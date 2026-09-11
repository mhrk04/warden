import { cn } from "@/lib/cn";

export interface ProgressProps {
  /** Current value (e.g. cumulative spent). */
  value: number;
  /** Maximum value (e.g. cumulative cap). */
  max: number;
  /** Accessible label describing what the bar measures. */
  label: string;
  className?: string;
}

/**
 * A determinate progress bar. The fill width is a whole-percent arbitrary-value
 * utility (`w-[NN%]`), safelisted in tailwind.config so it is real generated CSS
 * rather than an inline style. Over-cap values clamp to 100% and turn danger-red.
 */
export function Progress({ value, max, label, className }: ProgressProps) {
  const safeMax = max > 0 ? max : 1;
  const rawPct = (value / safeMax) * 100;
  const over = rawPct > 100;
  const pct = Math.max(0, Math.min(100, Math.round(rawPct)));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-elevated", className)}
    >
      <div
        data-progress-fill
        className={cn(
          "h-full rounded-full transition-all",
          `w-[${pct}%]`,
          over ? "bg-danger" : "bg-primary",
        )}
      />
    </div>
  );
}

import { cn } from "@/lib/cn";

export interface SkeletonProps {
  /** Accessible label announcing what is loading. */
  label?: string;
  className?: string;
}

/** An animated placeholder for loading states. */
export function Skeleton({ label, className }: SkeletonProps) {
  return (
    <div
      role="presentation"
      aria-label={label}
      aria-busy="true"
      className={cn("animate-pulse rounded-md bg-elevated", className ?? "h-4 w-full")}
    />
  );
}

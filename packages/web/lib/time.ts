/** Time helpers for the expiry countdown (Requirement 10.1). */

export interface Countdown {
  expired: boolean;
  /** Human string like "2d 3h" or "Expired". */
  label: string;
}

/** Compute a coarse countdown from a unix-seconds expiry to `nowMs`. */
export function countdown(expirySeconds: number | bigint, nowMs = Date.now()): Countdown {
  const expiryMs = Number(expirySeconds) * 1000;
  const diff = expiryMs - nowMs;
  if (diff <= 0) return { expired: true, label: "Expired" };

  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / (60 * 24));
  const hours = Math.floor((mins % (60 * 24)) / 60);
  const minutes = mins % 60;

  if (days > 0) return { expired: false, label: `${days}d ${hours}h` };
  if (hours > 0) return { expired: false, label: `${hours}h ${minutes}m` };
  return { expired: false, label: `${minutes}m` };
}

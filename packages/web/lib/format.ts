/** Format a raw token amount (6 decimals) as a human string. */
export function formatUsdc(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = (raw % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac.length ? `${whole}.${frac}` : `${whole}`;
}

/** Short-form an ethereum address for display. */
export function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

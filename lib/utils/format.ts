/** Display helpers. All input is decimal strings from the API wire format. */

/** "12345" BIPS -> "1.23x" */
export function ratio(bips: string | null): string {
  if (bips === null) return "—";
  const v = BigInt(bips);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const hundredths = (abs * 100n) / 10_000n;
  return `${neg ? "-" : ""}${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}x`;
}

/** "5700" BIPS -> "+0.57x" */
export function headroom(bips: string | null): string {
  if (bips === null) return "—";
  return BigInt(bips) < 0n ? ratio(bips) : `+${ratio(bips)}`;
}

/** "25" BIPS -> "0.25%" */
export function fee(bips: string): string {
  const v = BigInt(bips);
  return `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}%`;
}

/** UBA -> whole FXRP with thousands separators. */
export function fxrp(uba: string, unit: string): string {
  return (BigInt(uba) / BigInt(unit)).toLocaleString("en-US");
}

/** UBA -> FXRP with 2 decimals (for fee amounts, which are usually fractional). */
export function fxrpPrecise(uba: string, unit: string): string {
  const u = BigInt(unit);
  const v = BigInt(uba);
  const whole = v / u;
  const frac = ((v % u) * 100n) / u;
  return `${whole.toLocaleString("en-US")}.${frac.toString().padStart(2, "0")}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Epoch ms -> "Aug 12, 03:15 UTC" for trail timestamps. */
export function formatTs(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
}

export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Risk band derived from relative headroom on the binding leg. */
export function riskBand(
  projectedHeadroomBIPS: string | null,
  liquidationThresholdBIPS: string,
): { label: string; className: string } {
  if (projectedHeadroomBIPS === null) {
    return { label: "UNMEASURED", className: "text-[var(--color-faint)]" };
  }
  const h = BigInt(projectedHeadroomBIPS);
  if (h <= 0n) return { label: "BREACH", className: "text-[var(--color-bad)]" };

  const relative = Number(h) / Number(BigInt(liquidationThresholdBIPS));
  if (relative >= 0.5) return { label: "STRONG", className: "text-[var(--color-good)]" };
  if (relative >= 0.2) return { label: "ADEQUATE", className: "text-[var(--color-warn)]" };
  return { label: "THIN", className: "text-[var(--color-bad)]" };
}

export const REASON_LABELS: Record<string, string> = {
  insufficient_capacity: "not enough free capacity for this amount",
  not_normal_status: "agent is not in normal status",
  no_measurable_exposure: "backs nothing yet — post-mint ratio unmeasurable",
  would_breach_liquidation: "this mint would push it below its liquidation threshold",
};

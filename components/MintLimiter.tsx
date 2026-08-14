import type { DirectMintingView } from "@/lib/utils/view";
import { fee, fxrp } from "@/lib/utils/format";

/**
 * Live state of the Core Vault direct-minting rate limiter.
 *
 * This is the part of the *current* FAssets model LedgerGuard actually reads
 * on-chain: the AssetManager throttles direct mints with hourly and daily
 * windows plus a "large minting" delay. Almost no dashboard visualises it, so
 * showing it proves LedgerGuard reads the new surface, not just agent state.
 */
export function MintLimiter({ limiter }: { limiter: DirectMintingView }) {
  const unit = limiter.assetUnitUBA;
  const hourlyPct =
    Number(limiter.hourlyMintedUBA) / Math.max(1, Number(limiter.hourlyLimitUBA));
  const dailyPct =
    Number(limiter.dailyMintedUBA) / Math.max(1, Number(limiter.dailyLimitUBA));
  const blocked = Number(limiter.unblockUntilTimestamp) * 1000 > Date.now();

  return (
    <section className="mt-8 border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-white">
          Core Vault mint throttle (live)
        </h2>
        <span
          className={`text-[11px] tracking-wide ${blocked ? "text-[var(--color-bad)]" : "text-[var(--color-good)]"}`}
        >
          {blocked ? "minting throttled" : "minting open"}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        The AssetManager caps direct XRPL→Core Vault mints per hour and per day,
        and delays mints above a size threshold. These numbers are read live from
        the AssetManager at the snapshot block — the real constraint on the mint
        you just sized.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
            Hourly window
          </div>
          <Bar pct={hourlyPct} />
          <div className="mt-2 num text-xs text-[var(--color-muted)]">
            {fxrp(limiter.hourlyMintedUBA, unit)} / {fxrp(limiter.hourlyLimitUBA, unit)} FXRP used
          </div>
        </div>

        <div className="border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
            Daily window
          </div>
          <Bar pct={dailyPct} />
          <div className="mt-2 num text-xs text-[var(--color-muted)]">
            {fxrp(limiter.dailyMintedUBA, unit)} / {fxrp(limiter.dailyLimitUBA, unit)} FXRP used
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
        <Stat label="Large-mint threshold" value={`${fxrp(limiter.largeMintingThresholdUBA, unit)} FXRP`} />
        <Stat label="Large-mint delay" value={`${Number(limiter.largeMintingDelaySeconds)}s`} />
        <Stat label="Executor fee" value={fee(limiter.executorFeeBIPS)} />
        <Stat
          label="Throttle until"
          value={blocked ? new Date(Number(limiter.unblockUntilTimestamp) * 1000).toISOString().slice(11, 16) + " UTC" : "—"}
        />
      </div>
    </section>
  );
}

function Bar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  const color =
    clamped > 0.85 ? "var(--color-bad)" : clamped > 0.6 ? "var(--color-warn)" : "var(--color-good)";
  return (
    <div className="mt-2 h-1.5 w-full bg-[var(--color-line)]">
      <div className="h-full" style={{ width: `${clamped * 100}%`, background: color }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-faint)]">{label}</div>
      <div className="num mt-0.5 text-[var(--color-text)]">{value}</div>
    </div>
  );
}

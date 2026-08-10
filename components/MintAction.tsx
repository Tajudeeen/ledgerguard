"use client";

import { COSTON2_EXPLORER } from "@/lib/flare/coston2";

/**
 * Closing the loop without breaking the read-only rule.
 *
 * LedgerGuard never signs a transaction. But "here is who to pick, good luck"
 * is a weak demo. This card hands the user the exact parameters needed to mint
 * through the recommended agent on Coston2, plus the AssetManager address and
 * the function to call — so the advice is actionable from any wallet/console.
 * It is copy, not a transaction.
 */
export function MintAction({
  recommendedVault,
  amountFxrp,
  assetManager,
}: {
  recommendedVault: string;
  amountFxrp: number;
  assetManager: string;
}) {
  // 1 FXRP = 1e6 UBA on FAssets.
  const amountUba = Math.round(amountFxrp * 1_000_000).toLocaleString("en-US");
  return (
    <div className="mt-4 border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h3 className="text-sm font-medium text-[var(--color-text)]">
        Execute the mint — parameters for {" "}
        <span className="num text-[var(--color-accent)]">
          {recommendedVault.slice(0, 10)}…{recommendedVault.slice(-6)}
        </span>
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        LedgerGuard is read-only and never signs. These are the exact inputs to
        mint {amountFxrp.toLocaleString()} FXRP through the recommended agent via
        the AssetManager. Paste into a wallet or console to act on the advice.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">agentVault</dt>
          <dd className="num text-[var(--color-text)]">{recommendedVault}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">amount (UBA)</dt>
          <dd className="num text-[var(--color-text)]">{amountUba}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">AssetManager</dt>
          <dd className="num text-[var(--color-text)]">{assetManager.slice(0, 10)}…</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">function</dt>
          <dd className="num text-[var(--color-text)]">mint</dd>
        </div>
      </dl>
      <a
        href={`${COSTON2_EXPLORER}/address/${assetManager}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-[11px] text-[var(--color-accent)] hover:underline"
      >
        Open AssetManager on Coston2 explorer →
      </a>
    </div>
  );
}

"use client";

import { useState } from "react";

import { COSTON2_EXPLORER } from "@/lib/flare/coston2";

/**
 * Closing the loop without breaking the read-only rule or guessing an ABI.
 *
 * On the current FAssets model you do NOT pick an agent to mint - minting is a
 * direct XRPL payment to the Flare Core Vault, finalised on Flare by an
 * executor. Agents matter on the REDEMPTION side: when you burn FXRP to get XRP
 * back, the agent you route the redemption through must actually hold enough
 * free collateral to pay you out.
 *
 * LedgerGuard never signs a transaction and never encodes contract calldata
 * from an unverified interface. Instead it hands the user the safest agent for a
 * redemption of this size and explains what to check before redeeming. The
 * numbers (free capacity, collateral ratio, crash survival) all come from the
 * same on-chain snapshot the rest of the app ranks.
 */
export function RedemptionAgent({
  recommendedVault,
  amountFxrp,
  assetManager,
}: {
  recommendedVault: string;
  amountFxrp: number;
  assetManager: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(recommendedVault);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h3 className="text-sm font-medium text-[var(--color-text)]">
        Safest agent to redeem with
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        FXRP is minted with a direct Core Vault payment, so there is no
        &ldquo;mint agent&rdquo; to pick. When you later burn{" "}
        <span className="num text-[var(--color-text)]">{amountFxrp.toLocaleString()} FXRP</span>{" "}
        to redeem back to XRP, this is the agent with the most crash-resilient
        collateral among those with enough free capacity to cover it. Redeeming
        through a thin agent is the real risk: it can run out of collateral to pay
        you. Always match the agent&rsquo;s free capacity against your redemption
        size before signing.
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2">
        <span className="num break-all text-[11px] text-[var(--color-text)]">
          {recommendedVault}
        </span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-black hover:opacity-90"
        >
          {copied ? "copied" : "copy vault"}
        </button>
      </div>

      <a
        href={`${COSTON2_EXPLORER}/address/${recommendedVault}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-[11px] text-[var(--color-accent)] hover:underline"
      >
        Open agent vault on Coston2 explorer →
      </a>
      <span className="mt-1 block text-[10px] text-[var(--color-faint)]">
        AssetManager {assetManager.slice(0, 10)}… on Coston2 - LedgerGuard is
        read-only and never signs a transaction.
      </span>
    </div>
  );
}

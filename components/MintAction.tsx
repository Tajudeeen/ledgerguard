"use client";

import { COSTON2_EXPLORER } from "@/lib/flare/coston2";

const FASSETS_MINTING_DOCS = "https://dev.flare.network/fassets/minting";

/**
 * How FXRP minting actually works on the current FAssets model - and why there
 * is no "mint agent" to pick.
 *
 * LedgerGuard is read-only and never signs. This panel explains the verified
 * flow so a visitor who read the old docs is not misled:
 *   1. Send XRP from an XRPL wallet directly to the Flare Core Vault.
 *   2. Encode the Flare recipient (and an optional executor) in a destination
 *      tag or the XRPL memo.
 *   3. An executor calls `executeDirectMinting(IXRPPayment.Proof)` on the
 *      AssetManager to finalise the mint on Flare.
 * No agent is chosen at mint time. Agents post the collateral behind the FXRP
 * and are the counterparties you deal with to redeem back to XRP.
 */
export function CoreVaultMint() {
  return (
    <section className="mt-10 border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-[var(--color-text)]">
          How FXRP minting works now
        </h2>
        <a
          href={FASSETS_MINTING_DOCS}
          target="_blank"
          rel="noreferrer"
          className="num text-[11px] text-[var(--color-accent)] hover:underline"
        >
          FAssets minting docs →
        </a>
      </div>

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-[var(--color-muted)]">
        Minting FXRP is a <span className="text-[var(--color-text)]">direct payment to the Core Vault</span> - not a choice of agent. You send XRP from an XRPL wallet to the Core Vault address, tagging the payment with your Flare recipient (and optionally a preferred executor) via a destination tag or the XRPL memo. An executor then finalises the mint on Flare by calling{" "}
        <span className="num">executeDirectMinting</span>. This is the model the current FAssets protocol uses; the old &ldquo;pick an agent to mint&rdquo; flow no longer applies, which is why LedgerGuard ranks agents by the collateral they post - the risk that actually remains is on the redemption side and in the backing behind your FXRP.
      </p>

      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ["1 · Pay", "Send XRP to the Core Vault on XRPL with your Flare address in the destination tag / memo."],
          ["2 · Execute", "An executor calls executeDirectMinting(IXRPPayment.Proof) to finalise the mint on Flare."],
          ["3 · Redeem", "Later, burn FXRP with an agent - pick one with enough free collateral to pay you out."],
        ].map(([title, body]) => (
          <li
            key={title}
            className="border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3"
          >
            <div className="text-[11px] font-medium tracking-wide text-[var(--color-accent)]">
              {title}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-muted)]">
              {body}
            </p>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[11px] text-[var(--color-faint)]">
        LedgerGuard never signs a transaction and never picks your executor. It
        ranks the agents whose collateral backs the system so you can see who is
        safe to redeem with and how concentrated that backing is. Verify the on-chain
        flow via the{" "}
        <a
          href={COSTON2_EXPLORER}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--color-accent)] hover:underline"
        >
          Coston2 explorer
        </a>
        .
      </p>
    </section>
  );
}

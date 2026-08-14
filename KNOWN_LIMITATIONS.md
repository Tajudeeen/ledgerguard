# Known limitations

LedgerGuard is a **decision aid, not a guarantee.** This document is deliberately
specific about what the product cannot do, because a risk tool that overstates
its own certainty is worse than no tool.

**Model context.** Minting FXRP on the current FAssets model is a direct XRPL
payment to the Core Vault, finalised on Flare by an executor — there is no agent
to choose at mint time. The agent risk that remains is on the **redemption** side
(agents must hold enough free collateral to pay you out) and in the **collateral
backing** behind the FXRP already in circulation. LedgerGuard ranks that
collateral standing; it never signs a transaction and never reserves collateral.

## The ranking is a snapshot, and snapshots go stale

Every figure is read at one pinned block. The instant that block is behind you:

- Agents mint and redeem, changing `mintedUBA` and every ratio derived from it.
- Agents deposit or withdraw collateral.
- Agents enter or leave the available list.
- Agents change their fee.
- FTSO prices move, which moves every collateral ratio independently of any
  action by the agent.

A ranking produced thirty seconds ago may already recommend a different agent.
LedgerGuard shows the snapshot block on every screen for exactly this reason.

## The projection assumes the asset price is held constant at "take-on" time

`CR_after = CR_before × backed / (backed + mint)` is an exact identity **holding
the asset price constant**. That assumption is what lets LedgerGuard avoid a
price oracle entirely — the unknown collateral value and price cancel.

It also means the projection isolates the effect of *your redemption* — the
exposure a redemption of the entered size would place on an agent. It is not
a forecast. If XRP moves against the collateral between the snapshot and your
redemption, the realised ratio will differ from the projected one, and the
error can exceed the headroom differences between agents.

## Ratios are read, not recomputed

`vaultCollateralRatioBIPS` and `poolCollateralRatioBIPS` are taken as the
AssetManager reports them, which means LedgerGuard inherits whatever price age
and rounding the protocol used at that block. LedgerGuard does not independently
value collateral, and cannot detect a stale or manipulated price feed.

## Liquidation thresholds are collateral-type-wide

Thresholds come from `getCollateralTypes()` and apply to every agent using that
collateral token. Governance can change them. An agent that looks comfortable
under today's 1.20x vault threshold would look very different under 1.40x.

## "Would breach liquidation" is a ratio test, not a protocol simulation

LedgerGuard flags an agent when the projected ratio falls to or below the
liquidation threshold. It does **not** simulate the AssetManager's minting
logic. The protocol may reject a mint that LedgerGuard considers eligible, and
its own checks — not LedgerGuard's — are authoritative. LedgerGuard never
executes a transaction and never reserves collateral.

## Capacity is derived from free lots

`availableCapacityUBA = freeCollateralLots × lotSizeAMG × granularity`. Because
redemptions consume an agent's free lots, a request that is not a
whole number of lots will be handled differently by the protocol than the naive
UBA comparison suggests.

## Agents with no exposure cannot be scored

An agent backing nothing has no meaningful collateral ratio, so its post-mint
ratio cannot be projected from the ratio alone. LedgerGuard marks these
`no_measurable_exposure` and excludes them from recommendation. **This is not a
statement that such agents are unsafe** — it is a statement that LedgerGuard
cannot measure them, and it declines to guess.

## The score is a judgement, not a fact

The weights (0.50 / 0.25 / 0.15 / 0.10) are a defensible, published, tested
choice. They are still a choice. A different minter with a different risk
appetite could justify different weights and get a different ranking. Every
component is exposed in the UI so you can disagree with the aggregate and still
use the parts.

Scores saturate, so several agents can legitimately tie at 1.0. Ties are broken
on raw headroom, then fee, then address — the last of which is arbitrary, and is
only ever reached when the agents are genuinely indistinguishable on every
metric that matters.

## HHI describes the system, not your counterparty

Concentration is reported separately and is not part of any agent's score. A
low-HHI system can still contain a dangerously thin agent, and a high-HHI system
can consist entirely of well-collateralised ones.

## The attestation proves provenance, not correctness

An on-chain attestation proves that a particular snapshot hash existed at a
particular time and was submitted by a particular address. It does **not** prove
that the ranking was correct, that the recommended agent is safe, or that the
agent is bound to anything. Anyone can attest anything. Correctness is
established only by re-deriving the hash from chain state, which is why
`script/reproduce.ts` exists.

Reproducing a historical attestation requires an **archive** RPC. Once public
nodes prune the block, verification needs an archive provider.

## Receipt caching is a convenience, not a source of truth

Receipts are cached to disk so `/verdict/[id]` can render without re-running the
ranking. The page independently reads the attestation back from Coston2 and
compares hashes, displaying the result. A tampered cache produces a visible
mismatch, not a false verification. The cache is local to the deployment and is
not durable storage.

## Testnet reality

Coston2 currently has **four** available FXRP agents, all charging **0.25%**.
Consequences:

- The cheapest-vs-safest trade-off cannot be shown with a genuine fee spread.
  LedgerGuard detects this and says so rather than manufacturing a comparison.
- HHI over four agents is coarse; its floor is 0.25.
- Ranking behaviour at realistic agent-set sizes is exercised by unit tests, not
  by live data.

## The crash-scenario liquidation move is ratio-derived, not a market prediction

The per-agent "how far XRP can fall" figure is computed from on-chain collateral
ratios alone (`moveBIPS = -((current - liq) * 10000) / current`). It assumes the
ratio scales linearly with the collateral asset price and that nothing else
changes (no recapitalisation, no redemption queue, no second-order liquidation
cascade). It is a robust *lower-bound* on fragility, not a simulation of an actual
crash. The FTSO price is used only to express the move as a dollar target.

## The stress test is a ratio sensitivity analysis, not a forecast

The price-shock control multiplies on-chain collateral ratios by `(1 + shock)`.
It isolates the effect of an adverse price move on *headroom*; it does not model
cascading liquidations, redemption queues, or agent self-recapitalisation, and it
says nothing about the probability of any given shock. It is a what-if, not a
prediction.

## FTSO on testnet

Flare's FTSO V2 XRP/USD feed is resolved from the registry and read, but on
Coston2 the feed values are often not served (zero value, near-epoch timestamp).
We surface the feed id and either the live price or an explicit "not served here"
notice. The stress test does not depend on the feed, so the feature works
regardless.

## The agent trail is reconstructed, not re-read

The verifiable trail (`/trail`, `/agent/[vault]`) is built by walking the
attestation log and reading each point's ranking from the **receipt cache** that
was written at attest time. This is a convenience, not the source of truth. The
source of truth is the on-chain commitment: each point pins a block and a hash.
Anyone can take that block, re-run the engine with `script/reproduce.ts <block>
<amount> <id>`, and confirm the cached ranking reproduces the stored hash. We do
not re-read every historical block on every page load because it would be slow
and the cache already makes the data available; the contract remains the
arbiter, and the hash is what reconciles the two.

The stability score summarises the *recorded* history. It is a description of the
past, not a prediction of the future, and it deliberately is not part of the
per-mint decision score. A long run of healthy points does not make the next
block safe.

## Not covered at all

No mint execution (the FXRP mint is a direct Core Vault payment, not an agent
choice). No mainnet or Songbird. No FAssets other than FXRP. No live redemption
execution — LedgerGuard identifies which agents can safely cover a redemption
and how crash-resilient they are, but does not perform the burn. No detection of
agent misbehaviour or collusion. No MEV or transaction-ordering considerations.

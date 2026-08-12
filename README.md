# LedgerGuard

**Risk-aware agent selection for FXRP minting on Flare.**

FAssets publishes everything about its minting agents on-chain. It does not tell
you which one to use. LedgerGuard reads the live agent set on Coston2, projects
what *your* mint would do to each agent's collateral position, ranks them by
transparent metrics, and anchors the resulting ranking on-chain so the
recommendation can be audited after the fact.

```
enter 500 FXRP  →  4 agents analyzed  →  recommended vs cheapest
                →  full leaderboard   →  anchor on Coston2  →  receipt
```

---

## Problem

To mint FXRP you must pick an agent. `getAvailableAgentsDetailedList()` returns
fee, minting collateral ratios and free lots; `getAgentInfo()` returns roughly
forty more fields per agent. None of it answers the only question a minter
actually has:

> If I mint this amount through this agent, how exposed am I?

The naive answer — sort by fee — is actively wrong. Fee is a few basis points.
The difference between an agent sitting at a comfortable collateral ratio and
one hovering just above its liquidation threshold is the difference between a
position that survives an adverse price move and one that does not. Those two
agents can be **five basis points apart on price**.

## Solution

LedgerGuard turns the raw agent data into a ranked, explained decision:

1. Reads every available agent from the FXRP AssetManager at a single pinned block.
2. Projects each agent's collateral ratio *after* the requested mint.
3. Measures headroom against the agent's real liquidation threshold.
4. Ranks agents on published, weighted, individually visible components.
5. Shows the recommended agent against the cheapest one, and explains the gap
   in a sentence generated from the actual numbers.
6. Commits the whole ranking to a deterministic hash and anchors it on Coston2.

## Why Flare

Everything LedgerGuard reads is Flare-native and resolved at runtime:

| What | How |
|------|-----|
| Contract discovery | `FlareContractRegistry` at `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` — the only hardcoded address |
| FXRP asset manager | `getContractAddressByName("AssetManagerFXRP")` → `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` |
| Agent set | `IAssetManager.getAvailableAgentsDetailedList(start, end)` |
| Agent detail | `IAssetManager.getAgentInfo(agentVault)` |
| Liquidation thresholds | `IAssetManager.getCollateralTypes()` |
| Lot sizing | `IAssetManager.getSettings()` |
| Anchoring | `RankingAttestation.sol`, deployed on Coston2 |

Interfaces come from `@flarenetwork/flare-wagmi-periphery-package` (the
generated Coston2 ABIs), not from tutorials. Because the AssetManager is
resolved through the registry on every request, a redeploy of the asset manager
does not break LedgerGuard.

## Architecture

```
coston2
   ↓  FlareContractRegistry.getContractAddressByName("AssetManagerFXRP")
asset manager
   ↓  getSettings / getCollateralTypes
   ↓  getAvailableAgentsDetailedList → getAgentInfo   (all pinned to one block)
AgentSnapshot[]                                        lib/fassets
   ↓  projected CR, headroom, capacity, HHI
risk engine                                            lib/scoring   ← pure, tested
   ↓
ranked Agent[] + explanation
   ↓  abi.encode → keccak256
snapshot hash                                          lib/attestation
   ↓  user's wallet signs
RankingAttestation on coston2                          contracts/
   ↓
receipt at /verdict/[id]                               app/verdict
```

The scoring engine is a pure function with no network, no clock and no
randomness. That is what makes the anchored hash reproducible.

It is also covered by an offline test suite — `npm run test:coverage` runs
**64 scoring-engine tests** across the ranking, headroom, liquidation, stress,
breach-cascade and trail modules and reports **~91% line coverage** (branch
~71%). The live-chain reader (`fxrp-agent-reader.ts`) is covered by the
`live-chain`-only integration test `npm run test:live`, so it is excluded from the
offline coverage denominator.

## Scoring methodology

Nothing here is a black box. Every number below is visible in the UI.

### Projected collateral ratio

A mint does not change an agent's collateral — it increases the asset value that
collateral must back. So for constant collateral and constant price:

```
CR_after = CR_before × backedBefore / (backedBefore + mintAmount)
```

This is an **identity, not an estimate**: the unknown collateral value and the
unknown asset price cancel out. LedgerGuard needs no price oracle to project the
post-mint ratio, and the projection cannot drift because of a stale feed.

`backed = mintedUBA + reservedUBA + redeemingUBA` — all three consume
collateral, so counting only `mintedUBA` would flatter a busy agent.

### Two collateral legs

An FAssets agent is backed by two independent collateral pools, each with its
own ratio and its own liquidation threshold, read from `getCollateralTypes()`:

| Leg | Token (Coston2) | Liquidation | Safety |
|-----|------------------|-------------|--------|
| vault | testUSDT | 1.20x | 1.30x |
| pool  | C2FLR    | 1.50x | 1.60x |

An agent is only as safe as its **weaker leg**, so LedgerGuard projects both and
scores the binding one. "Weaker" is measured *relative* to each leg's own
threshold, since +0.30x means something different above 1.20x than above 1.50x.

```
headroom          = CR − liquidationCR
relativeHeadroom  = headroom / liquidationCR
```

### Components and weights

Each component is normalised to `[0,1]` before weighting, so no factor can
dominate through raw magnitude.

| Component | Weight | Definition |
|-----------|--------|------------|
| Post-mint headroom | **0.50** | relative headroom on the binding leg after the mint, saturating at 1.0 |
| Current health | **0.25** | relative headroom on the weaker leg before the mint |
| Capacity buffer | **0.15** | remaining capacity after the mint, saturating at 10× the mint |
| Fee | **0.10** | normalised against the observed fee spread |

```
score = 0.50·postMintHeadroom + 0.25·currentHealth
      + 0.15·capacityBuffer   + 0.10·fee
```

**Post-mint headroom carries the most weight because it is the only term the
user's decision actually changes.** Fee is capped at 0.10 — strictly below every
safety term — so a cheaper agent can never outrank a materially safer one. This
bound is asserted in the test suite, not just claimed here.

Scores saturate deliberately: past a cushion equal to the liquidation threshold,
more collateral does not change *this* mint's risk. Well-collateralised agents
can therefore legitimately tie at 1.0, and ties are broken on raw unsaturated
headroom, then fee, then address — never on address alone.

### Eligibility

An agent is excluded from recommendation, with the reason shown, when it has
insufficient capacity, is not in normal status, backs nothing yet (post-mint
ratio unmeasurable — treated as unknown, never as safe), or when the mint would
push it below a liquidation threshold.

### HHI concentration

```
share_i = backed_i / totalBacked      HHI = Σ share_i²
```

HHI is reported as **system context, separately from agent risk, and is not a
term in any agent's score.** It describes how concentrated FXRP backing is
across the agent set; it says nothing about whether a given agent is safe for
you. Conflating the two would be a category error.

## On-chain proof

`contracts/RankingAttestation.sol` stores a commitment, not the leaderboard —
the ranking is reproducible from the block number, so writing rows on-chain
would cost gas for no added trust. No owner, no admin, no upgrade path;
append-only.

The commitment is `keccak256` over an `abi.encode` of the full ranking, format
`LEDGERGUARD-V1`. JSON is deliberately avoided: key ordering and number
formatting are not stable across implementations. See
[docs/SNAPSHOT-FORMAT.md](docs/SNAPSHOT-FORMAT.md) for the exact byte layout.

### Live proof on Coston2

- **Contract:** `RankingAttestation` at `0x2b38cc9b84bd3a568ccc7817b10dc98c8abdab36`
  ([explorer](https://coston2.testnet.flarescan.com/address/0x2b38cc9b84bd3a568ccc7817b10dc98c8abdab36))
- **Deployment tx:** `0xc820f07be337de9ddaf2be7ec86603b58a9461151be72b49a3dfc98c85c9af11`
- **First attestation (id `1`):** snapshot block `33867859`, 500 FXRP, recommended
  agent `0x55c815260cBE6c45Fe5bFe5FF32E3C7D746f14dC`, tx
  `0x09541e89ac9b5e75e41cd9d56ebf683be249c7afe558c21070c82d1a1dd3d866`
  ([explorer](https://coston2.testnet.flarescan.com/tx/0x09541e89ac9b5e75e41cd9d56ebf683be249c7afe558c21070c82d1a1dd3d866)),
  committing to hash `0x2df1aaf42cde729738cede06d0df325ee671b5425a786500412d27eca214f97f`.
- **Reproduce it yourself:** `npx tsx script/reproduce.ts 33867859 500 1` replays
  block 33867859 and reports a match.

The receipt at `/verdict/1` re-reads the contract and shows VERIFIED: the
on-chain record reproduces the ranking hash byte-for-byte.

### Verify any attestation yourself

```bash
npx tsx script/reproduce.ts <blockNumber> <mintAmountFxrp> [attestationId]
```

This re-reads Coston2 at the attested block, re-runs the engine, and compares
its hash against the one stored on-chain. Confirmed working against historical
blocks — the same block and amount reproduce a byte-identical hash.

## Verifiable agent trail

Anchoring one ranking proves *provenance*. Re-anchoring the same standard mint
repeatedly turns the contract into a **dated, replayable record of agent
behaviour** — something no centralised FAssets monitor can fake, because every
point pins a block and a hash anyone can re-derive.

`/trail` reads every attestation from the deployed contract and reconstructs,
per agent, its recorded projected headroom at each point. `/agent/[vault]`
shows one agent's full history and a transparent **stability score**:

```
stability = 0.6 · avgRelativeHeadroom + 0.3 · availability + 0.1 · recommendedShare
```

- `avgRelativeHeadroom` = mean projected headroom normalised to the agent's own
  liquidation threshold (so vault- and pool-leg agents compare fairly).
- `availability` = eligible observations ÷ total observations.
- `recommendedShare` = times this agent was the pick ÷ observations.

Every term is displayed on the agent page. The score summarises the *past*; it
is not a forecast and is not part of the per-mint decision score.

Keep the trail alive with the worker (it attests the standard 500 FXRP mint at
intervals, reusing the same key path as the manual anchor):

```bash
npm run trail:backfill     # replay ~12 recent points to seed history
npm run trail:run          # backfill, then attest every 5 minutes forever
```

Each attestation writes its full ranking to the receipt cache so the trail and
agent pages can reconstruct every point; each point is independently
re-verifiable via `script/reproduce.ts <block> <amount> <id>`.

## Stress test — what if the price moves?

The single-mint ranking answers *"which agent, today?"* The stress test answers
*"which agent survives a bad day?"* — the question the fee-spread demo can't
reach on a homogeneous testnet where every agent charges the same 0.25%.

The homepage exposes a **price-shock** control (−10% / −25% / −40% / −60%). It
applies a deterministic sensitivity analysis to the on-chain collateral ratios
LedgerGuard already reads:

```
CR_after_shock = CR_after_constant × (1 + shock)
```

Because collateral ratio = collateral value ÷ minted value, a fractional price
drop `shock` scales the ratio by `(1 + shock)`. No oracle is needed, so the
result is identical on testnet and mainnet and reproduces exactly. The
leaderboard gains a live **"If −40%"** column: agents whose post-shock projected
headroom falls below their liquidation threshold are flagged ineligible — the
same rejection path the real recommendation uses, but now fired by a *market*
move rather than by mint size. At 500 FXRP nothing breaches; at 5,000 FXRP with
a −40% shock two of four Coston2 agents drop out, and the recommendation
narrows to the two that hold. That is the decision having consequences.

LedgerGuard also reads the live **Flare FTSO V2** XRP/USD feed (resolved from the
registry, like every other contract) and displays it as the market price the
AssetManager uses. On the Coston2 *testnet* the feed is frequently not
populated; when that happens the UI says so plainly and the stress test falls
back to on-chain ratios — it never shows a fabricated price.

## Crash scenario — FTSO-aware, per-agent

The homepage's scenario panel turns the oracle into the centrepiece of the
decision. For every agent it computes the **liquidation price-move** — how far
XRP can fall before that agent's collateral ratio hits its binding liquidation
threshold:

```
moveBIPS = -((currentBIPS - liqBIPS) * 10000) / currentBIPS
```

This is exact and derived entirely from on-chain ratios, so it needs no oracle
to compute. When the live FTSO XRP/USD price is available it is also expressed
as an absolute dollar target ("liquidates if XRP < $Y"). The agents are sorted
most-robust-first, so the recommendation and the weakest agent are visible side
by side — "Agent X survives a −85% crash; the weakest dies at −28%." That is the
risk-adjusted story a fee comparison cannot tell on a homogeneous testnet.

The app opens on a choreographed, scroll-revealed narrative: hero → recommended
agent → why (cheapest vs safest) → crash scenario → full leaderboard → anchor on
Coston2. A splash introduces the name and motto.

## Running it

```bash
npm install
npm run build && npm start        # http://localhost:3000

npm test                          # 64 scoring-engine unit tests
npm run test:coverage             # same suite + v8 coverage report (~91% lines)
npm run test:live                 # live Coston2 integration test
npm run typecheck
```

Contract:

```bash
node script/compile.mjs                                  # solc 0.8.28, optimizer on
DEPLOYER_PRIVATE_KEY=0x... node script/deploy.mjs        # → deployments/coston2.json
```

Then set `NEXT_PUBLIC_ATTESTATION_ADDRESS` to the deployed address to enable
anchoring in the UI. **This variable is inlined at build time** — `Next.js`
only exposes `NEXT_PUBLIC_*` vars that were present when `next build` ran, so
set it in the environment before building, not only before `next start`.

## Hackathon scope

Built during the hackathon: the entire Coston2 read pipeline, the scoring
engine and its test suite, the deterministic snapshot format,
`RankingAttestation.sol`, the deploy and reproduce scripts, the comparison UI,
the leaderboard, the receipt page, the **verifiable agent trail**, the **oracle-aware stress test**, and the **FTSO-driven crash scenario** with a choreographed narrative — a
running, replayable history of agent behaviour built from repeated attestations
of the standard mint (`/trail`, `/agent/[vault]`, `script/trail-worker.ts`).

Not built and not claimed: mint execution, mainnet or Songbird support,
non-FXRP FAssets, and multi-asset portfolio management.

## Known limitations

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). The short version: LedgerGuard
is a **decision aid, not a guarantee**. It ranks a snapshot that is stale the
moment after it is taken, it does not execute or bind anything, and it does not
replace AssetManager enforcement.

One honest observation about the current testnet: **all four available Coston2
agents charge the same 0.25% fee.** The cheapest-vs-safest trade-off the product
is designed around therefore cannot be demonstrated with a real fee spread
today. Rather than fabricate one, LedgerGuard detects the condition, says so
plainly, and contrasts the recommendation against the *weakest agent available
at the same price* — which is the decision that actually matters when fee
carries no information.

## Roadmap

Only what follows from the current architecture:

- Watch mode: re-rank on new blocks and alert when an anchored recommendation
  degrades past a threshold.
- Multi-lot splitting: route a large mint across several agents to reduce both
  per-agent impact and system concentration.
- Historical attestation index: track how recommendations aged. _(Delivered
  as the agent trail — see above.)_
- Songbird and mainnet once the FXRP agent set there is non-trivial.

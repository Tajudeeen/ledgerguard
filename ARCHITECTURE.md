# Architecture

One Next.js app, one contract, no monorepo. Small enough that one developer can
hold all of it in their head.

```
ledgerguard/
├── app/
│   ├── page.tsx                    FXRP amount → agent view → anchor
│   ├── verdict/[id]/page.tsx       receipt, re-verified against chain
│   ├── trail/page.tsx              verifiable agent history (overview)
│   ├── agent/[vault]/page.tsx      one agent's trail + stability score
│   └── api/
│       ├── rank/route.ts           live read + rank (server-side)
│       ├── receipts/route.ts       receipt cache write
│       └── trail/route.ts          contract → per-agent trails
├── components/
│   ├── AgentComparison.tsx         safest redemption agent vs weakest - the centrepiece
│   ├── AgentTable.tsx              full leaderboard
│   ├── RiskScore.tsx               score component breakdown
│   ├── RedemptionAgent.tsx         safest agent to redeem with + Core Vault explainer
│   ├── TrailList.tsx               agent stability overview table
│   ├── ConcentrationPanel.tsx      HHI, shown apart from agent risk
│   └── AnchorButton.tsx            wallet → attestation tx
├── lib/
│   ├── flare/coston2.ts            registry address, client, chain constants
│   ├── fassets/fxrp-agent-reader.ts  registry → asset manager → AgentSnapshot[]
│   ├── scoring/
│   │   ├── headroom.ts             projection identity + headroom
│   │   ├── concentration.ts        HHI
│   │   ├── rank-agents.ts          weights, components, ranking
│   │   └── explain.ts              number-derived explanations
│   ├── attestation/
│   │   ├── snapshot-hash.ts        LEDGERGUARD-V1 commitment
│   │   └── abi.ts                  contract ABI + address
│   ├── types/agent.ts              AgentSnapshot, CollateralTypeInfo
│   └── utils/                      view serialisation, formatting, receipts
├── contracts/RankingAttestation.sol
├── script/                         compile, deploy, reproduce, trail-worker
├── test/                           engine + trail unit tests + live integration
└── docs/SNAPSHOT-FORMAT.md
```

## Layering

Three layers, one direction of dependency:

```
chain adapter  (lib/flare, lib/fassets)   - knows about RPC and ABIs
      ↓
scoring engine (lib/scoring, lib/attestation) - pure; no network, no clock
      ↓
presentation   (app, components)          - knows about React, never about ABIs
```

The scoring engine imports nothing from `viem` except `keccak256`/`encodeAbiParameters`
for hashing, and nothing from React at all. It can be run from a script, a test,
or a server route identically - which is what makes `script/reproduce.ts`
possible as a genuine third-party verification path rather than a re-run of the
same code path the UI uses.

## Why ranking happens server-side

`/api/rank` does the chain read and the ranking, returning a serialised view.
Reasons:

- The browser would otherwise need CORS-friendly RPC access and would expose the
  endpoint.
- UBA amounts exceed `Number.MAX_SAFE_INTEGER`; keeping bigint math on the
  server and serialising to decimal strings avoids any chance of a lossy
  round-trip through JSON numbers.
- The route is `force-dynamic` with `cache-control: no-store`. A cached ranking
  is a stale risk claim, which is worse than a slow one.

## Data flow for one ranking

1. `getBlock()` - pin a block number; every subsequent call uses it.
2. Registry → `getContractAddressByName("AssetManagerFXRP")`.
3. Parallel: `getSettings()`, `getCollateralTypes()`, first page of
   `getAvailableAgentsDetailedList(0, 50)`.
4. Page through the remainder if `totalLength > 50`.
5. `getAgentInfo(vault)` per agent, cross-checked against the list entry.
6. Sort by vault address → `AgentSnapshot[]`.
7. `rankAgents(state, mintAmountUBA)` → components, scores, ranks, eligibility.
8. `explainRecommendation(ranking)` → prose from the numbers.
9. `buildSnapshotCommitment(ranking)` → `abi.encode` → `keccak256`.

Steps 7-9 are pure. Given the same step-6 output they always produce the same
bytes, on any machine, at any later time.

## Anchoring

The client encodes `attest(...)` and sends it through the injected wallet -
LedgerGuard holds no key. The attestation id is recovered from the first indexed
topic of `RankingAttested`, and the ranking is cached so the receipt can render
it.

The receipt page does not trust that cache: it reads the attestation back from
Coston2 and compares the stored hash with the cached ranking's hash, rendering
the comparison result. A tampered cache shows a mismatch banner.

## Verifiable agent trail

`RankingAttestation` stores only the commitment, so it is a *log*, not a
database. Re-anchoring the same standard mint (500 FXRP) over time produces a
dated sequence of points. `lib/attestation/trail.ts` (pure) walks those points
and reconstructs, per agent, its recorded projected headroom, eligibility, rank,
fee and score. The full ranking for each point is cached at attest time
(`lib/utils/receipt-store.ts`) so the trail does not need to re-read every
historical block - but every point remains independently re-derivable via
`script/reproduce.ts <block> <amount> <id>`.

The per-agent **stability score** is a transparent summary of the trail:

```
stability = 0.6 · avgRelativeHeadroom + 0.3 · availability + 0.1 · recommendedShare
```

`script/trail-worker.ts` keeps the log alive (backfill + loop). It reuses the
same deployer key path as the manual anchor and writes the ranking to the
receipt cache on every attestation.

## Testing strategy

- `test/scoring.test.ts` - 34 unit tests over the pure engine: the projection
  identity, headroom, HHI edge cases, eligibility, tie-breaking, ordering
  independence, and hash determinism. No network.
- `test/coston2-reader.integration.test.ts` - hits live Coston2 and asserts the
  registry resolves, the block is pinned, and capacity derives correctly from
  lots.
- `script/reproduce.ts` - end-to-end proof: replays a historical block and
  compares against the on-chain attestation.

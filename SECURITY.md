# Security

## Threat model

LedgerGuard is a read-only advisory tool. It holds no user funds, custodies no
keys, and executes no mints. The realistic harms are therefore: **giving a user
a wrong recommendation**, and **presenting an unverifiable claim as verified**.

## Trust boundaries

| Component | Trusted? | Why |
|-----------|----------|-----|
| Flare Contract Registry | yes | Canonical immutable entry point; the one hardcoded address |
| FXRP AssetManager | yes | Resolved via the registry; the protocol itself |
| Periphery ABIs | yes | Official `@flarenetwork/flare-wagmi-periphery-package` |
| RPC endpoint | **no** | Can serve stale or wrong data — see below |
| Scoring engine | verifiable | Pure, deterministic, unit-tested, open |
| Receipt cache | **no** | Re-verified against chain before display |
| Attestation submitter | **no** | Anyone can attest anything |

## Key decisions

**One hardcoded address.** Only the Contract Registry is a constant. The
AssetManager is resolved at runtime, so an address rotation cannot silently
point LedgerGuard at a wrong contract, and a stale hardcoded address cannot
produce confidently wrong output.

**Every read pinned to one block.** All calls in a ranking pass an explicit
`blockNumber`. Without this, a ranking could mix pre- and post-state across a
block boundary and produce a ratio that never existed. It is also what makes
the snapshot reproducible.

**Cross-checked agent identity.** The cheap list entry and the full
`getAgentInfo` record are compared on `ownerManagementAddress`; a mismatch
throws rather than silently building a snapshot from two different agents.

**Integer math end to end.** All chain values stay `bigint` through reading,
projection and hashing. Floats appear only in normalised `[0,1]` score
components and in display. UBA amounts exceed `Number.MAX_SAFE_INTEGER`, so
JSON numbers are never used on the wire — the API serialises bigints as decimal
strings.

**No private keys in the application.** The user signs the attestation with
their own wallet. LedgerGuard has no signer. The deploy script reads a key from
the environment and is a developer tool, never part of the running app.

## Contract

`RankingAttestation.sol` is intentionally minimal: no owner, no admin, no pause,
no upgradeability, no funds. There is no privileged role to compromise.

Input validation rejects an empty hash, zero agents, a zero mint amount, and a
`snapshotBlock` in the future. Re-attesting the same snapshot is permitted but
only the earliest sighting is indexed, so priority cannot be rewritten by a
later submitter.

An attestation is **a claim by its submitter**, timestamped by the chain. The
contract makes no assertion that the ranking is correct. Correctness is
established off-chain by re-deriving the hash, which requires no permission.

## Injection and untrusted input

The mint amount is parsed as a `BigInt` and range-checked. Receipt ids are
matched against `^[0-9]{1,20}$` before touching the filesystem, so a crafted id
cannot traverse paths. Agent addresses are rendered as text, never as HTML.

## What LedgerGuard does not defend against

- A malicious or lagging RPC endpoint serving fabricated agent data. Point it at
  an endpoint you trust; the block number in the output lets you cross-check.
- Manipulation of the underlying FTSO prices that drive collateral ratios.
- An agent that is well-collateralised at the snapshot and withdraws
  immediately afterwards.
- Anything about the agent's off-chain conduct.

## Language policy

The interface and documentation never describe an agent as "safe", "protected",
or "risk-free", and never claim a mint is guaranteed against liquidation. The
permitted vocabulary is comparative and measured: *stronger headroom*, *healthier
projected position*, *lower risk*, *risk-adjusted recommendation*. Where a value
cannot be measured, the UI says so instead of substituting a default.

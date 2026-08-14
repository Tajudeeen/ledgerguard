# Snapshot commitment format - `LEDGERGUARD-V1`

A LedgerGuard attestation commits to a keccak256 hash of one ranking. This
document specifies the bytes exactly, so a third party can reproduce the hash
without reading the TypeScript.

Reference implementation: `lib/attestation/snapshot-hash.ts`.

## Why not JSON

JSON is not a canonical format. Key ordering, whitespace, and number
formatting all vary between implementations, and JavaScript cannot represent a
`uint256` as a `number` without loss. Hashing a JSON string would therefore
produce a commitment that is reproducible only by the exact program that
created it - which defeats the purpose.

LedgerGuard uses `abi.encode`, which has a fixed byte layout defined by the
Solidity ABI specification and is implemented identically in every EVM
tool-chain.

## Encoding

Top-level `abi.encode` of, in order:

| # | Type      | Field           | Notes |
|---|-----------|-----------------|-------|
| 1 | `string`  | `version`       | Always `"LEDGERGUARD-V1"` |
| 2 | `uint256` | `chainId`       | `114` for Coston2 |
| 3 | `address` | `assetManager`  | Resolved via the Flare Contract Registry |
| 4 | `string`  | `asset`         | Always `"FXRP"` |
| 5 | `uint256` | `blockNumber`   | Block every read was pinned to |
| 6 | `uint256` | `blockTimestamp`| Timestamp of that block |
| 7 | `uint256` | `mintAmountUBA` | The amount the ranking answers for |
| 8 | `Agent[]` | `agents`        | Sorted **ascending by `agentVault`** |

`Agent` tuple:

| # | Type      | Field                       | Notes |
|---|-----------|-----------------------------|-------|
| 1 | `address` | `agentVault`                | |
| 2 | `uint16`  | `rank`                      | `1` = recommended |
| 3 | `bool`    | `eligible`                  | |
| 4 | `uint256` | `feeBIPS`                   | |
| 5 | `uint256` | `vaultCRBIPS`               | Current vault collateral ratio |
| 6 | `uint256` | `poolCRBIPS`                | Current pool collateral ratio |
| 7 | `uint256` | `projectedVaultCRBIPS`      | `0` when unmeasurable |
| 8 | `uint256` | `projectedPoolCRBIPS`       | `0` when unmeasurable |
| 9 | `uint256` | `bindingHeadroomOffsetBIPS` | See *Negative headroom* below |
|10 | `uint256` | `availableCapacityUBA`      | |
|11 | `uint256` | `backedBeforeUBA`           | `minted + reserved + redeeming` |
|12 | `uint256` | `scoreE18`                  | `floor(score * 1e18)` |

The commitment is `keccak256(encoded)`.

## Determinism rules

1. **Agent order is by address, ascending, lowercase-compared.** Rank travels
   as a field, so the byte layout never depends on a floating-point sort.
2. **Score is floored to an integer** at 1e18 scale. Float formatting differs
   between languages; flooring to an integer removes the ambiguity.
3. **Unmeasurable projections encode as `0`**, never as a sentinel maximum,
   and are always paired with `eligible = false`.
4. **No clock is read.** `blockTimestamp` comes from the block header, not from
   the machine producing the ranking, so the hash is reproducible later.

## Negative headroom

Headroom is signed - an agent can be below its liquidation threshold. For a
uniform encoding, field 9 is stored offset:

```
stored = 2**128 + headroomBIPS
```

Decoders recover the signed value with `stored - 2**128`. The offset is far
larger than any realistic headroom magnitude, so it cannot underflow.

## Reproducing a hash

```bash
# 1. Re-read Coston2 at the attested block (requires an archive node)
# 2. Re-run the engine and print the hash
node --experimental-strip-types script/reproduce.ts <blockNumber> <mintAmountFxrp>
```

The printed hash must equal the value stored by `RankingAttestation.get(id)`.

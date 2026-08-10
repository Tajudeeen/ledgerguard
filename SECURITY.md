# Security

LedgerGuard is a read-only risk-analysis tool for FXRP minting on Flare
Coston2. It never executes mints and never moves funds.

## What is public (safe to commit / already in this repo)

- Contract addresses, transaction hashes, and block numbers (on-chain, public
  by nature).
- The deployer **wallet address** (`0x5412…d7c8`) — an address is not a secret.
- The `RankingAttestation` ABI and source (`contracts/RankingAttestation.sol`).
- Deployment records under `deployments/` (address, tx, block, public ABI).
- All scoring, reading, and UI code.

## What must NEVER be committed

- `.env.local` and any file containing a **private key** or **mnemonic**.
  This file holds `DEPLOYER_PRIVATE_KEY` and is git-ignored (`.env*`).
- Any `.env` file other than the committed, key-free `.env.example`.
- Session tokens, API keys, or RPC credentials with write access.

`.gitignore` already excludes `.env*`. If you fork or clone this repo, create
your own `.env.local` — do not reuse the original deployer key.

## Attestation trust model

- `RankingAttestation` is **append-only**, with no owner/admin/upgrade path.
  Once a ranking is anchored, its hash cannot be changed.
- The receipt page (`/verdict/[id]`) re-derives the snapshot hash from the
  cached ranking and compares it to the on-chain value, showing a mismatch
  banner if they differ.
- The verifiable **trail** (`/trail`, `/agent/[vault]`) is reconstructed from
  on-chain attestation records plus a local receipt cache. The cache is
  tamper-evident (any change is caught by the verdict re-verification) but the
  cached *content* is trusted for display — it is a convenience layer, not the
  source of truth. The source of truth is the contract on Coston2.

## Risk disclaimer

LedgerGuard produces estimates from chain state at a point in time. Collateral
ratios, oracle prices, and agent availability change continuously. A ranking
can be stale the moment after it is produced. It is a decision aid, not
financial advice and not a guarantee against liquidation.

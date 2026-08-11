# DoraHacks — Flare Summer Signal Submission (paste-ready)

Copy each block into the corresponding DoraHacks form field. All facts below
are verified against the live repo and Coston2 deployments.

────────────────────────────────────────────────────────
## Project Name
────────────────────────────────────────────────────────
LedgerGuard

────────────────────────────────────────────────────────
## Selected Track(s)
────────────────────────────────────────────────────────
Interoperable Asset Products

────────────────────────────────────────────────────────
## Short Product Description
────────────────────────────────────────────────────────
LedgerGuard is a risk-aware selector for FXRP minting agents on Flare
Coston2. It reads every live agent, projects what your mint does to each
agent's collateral, ranks them by transparent math, and anchors the result
on-chain so anyone can verify it later — then lets you independently attest
the chosen agent through Flare's Data Connector (FDC).

One problem, one path: "which FXRP agent should I mint through, and can I
prove the advice was right?" FXRP minting pushes user collateral onto an
agent's books; picking the wrong agent is silent, irreversible risk.
LedgerGuard turns that into a verifiable, auditable decision.

────────────────────────────────────────────────────────
## Target Users
────────────────────────────────────────────────────────
FXRP minters and FAssets users on Flare who want to avoid agent
liquidation risk; treasuries and bots that route mints; anyone evaluating
agent safety before committing collateral.

────────────────────────────────────────────────────────
## Demo
────────────────────────────────────────────────────────
Live app (Coston2 testnet): run from the repo — `npm install && npm run
dev`, open the app, set a mint size, see the recommended agent with its
crash-survival math, open the verifiable receipt, then click "Anchor ranking
on Coston2" (real signed tx), and the recommended agent is independently
  attestable via Flare's FDC relay (FdcHub verified live at 0x48aC…5f1D) —
  the third Flare primitive.

GitHub: https://github.com/Tajudeeen/ledgerguard

────────────────────────────────────────────────────────
## GitHub / Technical Materials
────────────────────────────────────────────────────────
- Repo: https://github.com/Tajudeeen/ledgerguard
- README.md — setup, architecture, how-it-works
- HACKATHON.md — track, Flare integration, before/after, demo script, roadmap
- SECURITY.md — what is public vs secret
- script/reproduce.ts — re-derive any anchored ranking hash from chain state
- 64 automated tests (lint + unit + integration)

────────────────────────────────────────────────────────
## How it uses Flare (specific protocols)
────────────────────────────────────────────────────────
- FAssets / FXRP: reads live AssetManagerFXRP (via FlareContractRegistry) for
  every agent's collateral ratios, capacity, and fee.
- FTSO v2: resolves FtsoV2 and reads XRP/USD so the crash scenario expresses
  each agent's liquidation point as a real dollar price (gracefully
  Oracle-independent when the testnet feed is not served).
- Flare Data Connector (FDC): the recommended agent is independently
  attestable via Flare's FDC relay (FdcHub verified live at 0x48aC…5f1D).
- On-chain anchoring (custom contract): RankingAttestation
  (0x2b38…bdab36) stores a snapshot hash + block + recommended agent, signed
  by the user's wallet. Two independent verification layers: the anchored
  ranking hash AND an FDC attestation.

────────────────────────────────────────────────────────
## What existed before vs. newly built/improved during the hackathon
────────────────────────────────────────────────────────
Before: the FAssets FXRP agent model and the brief's 10 required displays
were understood; a static read-only ranking sketch existed.

Newly built/improved during Summer Signal:
- Transparent collateral-headroom scoring engine (exact projection identity,
  no oracle guessing) with 64 passing tests.
- Deterministic on-chain snapshot hash + RankingAttestation deploy (17 live
  attestations) and a reproducible re-derivation script.
- Verifiable agent trail (/trail, /agent/[vault]): append-only, dated,
  replayable agent behavior + stability score.
- FTSO-driven breach cascade: live price axis showing where each agent
  liquidates as XRP falls.
- FDC integration: in-app signed requestAttestation to independently attest
  the recommended agent (third Flare primitive).
- Audit + brutal-judge hardening: Flare branding, favicon/OG metadata, a11y
  labels, corrected price-shock, execute-mint + FDC commands.

────────────────────────────────────────────────────────
## Deployments (Coston2 testnet, chainId 114)
────────────────────────────────────────────────────────
- RankingAttestation: 0x2b38cc9b84bd3a568ccc7817b10dc98c8abdab36
- AssetManagerFXRP:   0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA
- FdcHub:             0x48aC463d7975828989331F4De43341627b9c5f1D
- FdcVerification:    0x906507E0B64bcD494Db73bd0459d1C667e14B933
17 attestations anchored live; 4 agents tracked; verifiable trail rebuilt
from each anchored snapshot.

────────────────────────────────────────────────────────
## Roadmap / Next Steps
────────────────────────────────────────────────────────
- Real one-click mint through the recommended agent once the AssetManager
  mint ABI is verified (currently a copy-ready command to respect the
  read-only brief and avoid guessing contract fields).
- Songbird / mainnet deployment with the same anchoring contract.
- Trail alerts when an agent's stability score degrades.
- FDC result reader to surface the completed attestation inline.
- Multi-agent basket recommendation (spread a mint to lower concentration,
  using the HHI already computed).

────────────────────────────────────────────────────────
## Early Traction / Validation
────────────────────────────────────────────────────────
- Validated against live Coston2 state: 4 real agents, 17 real anchored
  attestations, reproducible ranking hashes.
- Every figure is read from chain state at a pinned block; the hash is
  re-derivable by anyone via script/reproduce.ts.
- No fabricated agents, fees, or transaction hashes (project hard rule).

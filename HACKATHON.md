# LedgerGuard — Flare Summer Signal Submission

**Track:** Interoperable Asset Products (FAssets / FXRP, FTSO, FDC)
**Repo:** https://github.com/Tajudeeen/ledgerguard
**Live (Coston2):** deploy on Coston2 testnet; see README for run steps.

## What it is

LedgerGuard is a risk-aware selector for FXRP minting agents on Flare
Coston2. It reads every live agent, projects what your mint does to each
agent's collateral, ranks them by transparent math, and **anchors the result
on-chain so anyone can verify it later** — then lets you independently attest
the chosen agent through Flare's Data Connector.

One problem, one path: *"which FXRP agent should I mint through, and can I
prove the advice was right?"*

## How it uses Flare (specific protocols)

- **FAssets / FXRP** — reads the live `AssetManagerFXRP` (resolved via
  `FlareContractRegistry`) to pull every agent's collateral ratios, capacity,
  and fee. This is the core data the whole tool ranks on.
- **FTSO v2** — resolves `FtsoV2` and reads the XRP/USD feed so the crash
  scenario can express each agent's liquidation point as a real dollar price.
  Gracefully Oracle-independent when the testnet feed is not served.
- **Flare Data Connector (FDC)** — `FdcHub.requestAttestation(bytes)`
  (verified live on Coston2 at `0x48aC…5f1D`) lets the user request an
  independent attestation of the recommended agent's public metadata. Two
  verification layers: the on-chain ranking hash *and* an FDC attestation.
- **On-chain anchoring (custom contract)** — `RankingAttestation`
  (`0x2b38cc9b84bd3a568ccc7817b10dc98c8abdab36`, deployed Coston2) stores a
  snapshot hash + block + recommended agent, signed by the user's wallet.

## Deployments (Coston2 testnet, chainId 114)

| Contract | Address |
|---|---|
| RankingAttestation | `0x2b38cc9b84bd3a568ccc7817b10dc98c8abdab36` |
| AssetManagerFXRP | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` |
| FdcHub | `0x48aC463d7975828989331F4De43341627b9c5f1D` |
| FdcVerification | `0x906507E0B64bcD494Db73bd0459d1C667e14B933` |

17 attestations anchored live; 4 agents tracked; verifiable trail rebuilt from
each anchored snapshot.

## What existed before vs. built during Summer Signal

**Before the event:** the FAssets FXRP agent model and the brief's 10 required
displays were understood; a static read-only ranking sketch existed.

**Newly built / improved during Summer Signal:**
- Transparent collateral-headroom scoring engine (exact projection identity,
  no oracle guessing) with 64 passing tests.
- Deterministic on-chain snapshot hash + `RankingAttestation` deploy (17 live
  attestations) and a reproducible re-derivation script.
- The verifiable **agent trail** (`/trail`, `/agent/[vault]`): append-only,
  dated, replayable agent behavior + stability score.
- **FTSO-driven breach cascade**: a live price axis showing where each agent
  liquidates as XRP falls.
- **FDC integration**: in-app signed `requestAttestation` to independently
  attest the recommended agent (third Flare primitive).
- Audit + brutal-judge hardening pass: Flare branding, favicon/OG metadata,
  a11y labels, corrected price-shock, execute-mint + FDC commands.

## Early traction / validation

- Validated against **live Coston2 state**: 4 real agents, 17 real anchored
  attestations, reproducible ranking hashes.
- Every figure is read from chain state at a pinned block; the hash is
  re-derivable by anyone via `script/reproduce.ts`.
- No fabricated agents, fees, or transaction hashes — the brief's hard rule.

## 2-minute demo path

1. Open the app → it reads every live FXRP agent on Coston2.
2. Set mint size 5000 → recommended agent shown with "Survives XRP drop −85%"
   and full per-agent math.
3. Crash scenario: drag the XRP price; agents fall off the cliff in order.
4. Click **"View the verifiable on-chain proof"** → receipt shows the anchored
   hash matches the live ranking.
5. Click **"Anchor ranking on Coston2"** (real signed tx) or **"Attest agent
   via FDC"** (real signed FDC request) → two independent Flare verification
   layers.

## Roadmap / next steps

- **Real one-click mint** through the recommended agent once the AssetManager
  mint ABI is verified (currently a copy-ready command to respect the
  read-only brief and avoid guessing contract fields).
- **Songbird / mainnet** deployment with the same anchoring contract.
- **Trail alerts**: notify when an agent's stability score degrades.
- **FDC result reader**: surface the completed attestation inline once the
  FdcHub read API is confirmed, closing the attest → verify loop in-app.
- **Multi-agent basket** recommendation (spread a mint across agents to lower
  concentration, using the HHI already computed).

## Why it has lasting utility

FXRP minting pushes user collateral onto an agent's books; picking the wrong
agent is silent, irreversible risk. LedgerGuard turns that into a verifiable,
auditable decision — and the anchoring + FDC attestation mean the advice can be
proven after the fact, not just trusted. That is useful on Coston2 today and
portable to mainnet and Songbird as FXRP scales.

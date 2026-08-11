# LedgerGuard — 2-Minute Demo Script (for the submission video)

Record a clean screen capture of the live app on Coston2 (run `npm install &&
npm run dev`, open the app). Follow this shot-by-shot script. Total target:
~2:00. Speak naturally; the words in quotes are suggested narration.

────────────────────────────────────────────────────
## Shot 1 — The problem (0:00–0:15)
────────────────────────────────────────────────────
[Show the app hero: "Pick an FXRP minting agent you can actually trust —
and prove it later."]
Narration: "FXRP minting pushes your collateral onto an agent's books. Pick
the wrong agent and you get liquidated — silently, and irreversibly. LedgerGuard
answers one question: which agent should I mint through, and can I prove the
advice was right?"

────────────────────────────────────────────────────
## Shot 2 — Live read + recommendation (0:15–0:40)
────────────────────────────────────────────────────
[Type 5000 in the mint-size box, or click the 5000 preset. Wait for the
recommendation card to populate.]
Narration: "LedgerGuard reads every live FXRP agent on Flare Coston2 right
now — four agents — and projects what your 5000 FXRP mint does to each one's
collateral. It ranks them by transparent math. Here's the recommended agent,
and the key number: it survives an 85% XRP price drop before it liquidates.
The weakest eligible agent dies at 31%."

[Point at the "Survives XRP drop −85%" stat and the per-agent comparison.]

────────────────────────────────────────────────────
## Shot 3 — Crash scenario / breach cascade (0:40–1:00)
────────────────────────────────────────────────────
[Scroll to "What if the price moves?" → "Breach cascade". Drag the XRP-price
slider down. Show agents turning red as the price falls.]
Narration: "This is the crash scenario, driven by the live XRP price from
Flare's FTSO. Drag the price down and watch the agents fall off the cliff in
order — each line is the price at which that agent liquidates. This is what
makes the recommendation defensible under volatility."

────────────────────────────────────────────────────
## Shot 4 — Verifiable proof (1:00–1:25)
────────────────────────────────────────────────────
[Click "View the verifiable on-chain proof →". Show the receipt page:
"Verified — the hash stored on Coston2 matches this ranking."]
Narration: "Now the part that matters: the ranking isn't just trusted, it's
provable. LedgerGuard anchored a snapshot hash on Coston2 via our
RankingAttestation contract. Open the receipt and it shows the on-chain hash
matches the live ranking. Anyone can re-derive it from chain state."

────────────────────────────────────────────────────
## Shot 5 — Real on-chain actions (1:25–1:50)
────────────────────────────────────────────────────
[Back on the homepage, scroll to "Anchor it on Coston2". Click "Anchor
ranking on Coston2" → wallet prompt → confirmed. Then open "Independently
attestable via Flare FDC" and show the copy-ready cast send command + explorer link for the agent attestation.]
Narration: "And it's not just advice — it's a tool. A real, wallet-signed
transaction anchors the ranking hash on Coston2. The third Flare primitive,
the Data Connector, submits a copy-ready cast send FdcHub.requestAttestation(bytes) command (Coston2 relay is down; no fake auto-submit)."

────────────────────────────────────────────────────
## Shot 6 — Close (1:50–2:00)
────────────────────────────────────────────────────
[Show the agent trail page briefly: /trail with stability tiers.]
Narration: "LedgerGuard turns agent selection from a guess into a verifiable,
auditable decision — on Flare, today. Built for the Flare Summer Signal,
Interoperable Asset Products track."

────────────────────────────────────────────────────
## Recording tips
- Use a clean browser, zoom so text is readable.
- Mute notifications; close other tabs.
- If the wallet prompt is slow, pre-connect MetaMask to Coston2 so the click
  just confirms.
- Keep cursor movements deliberate; pause 1s on each key stat.
- Export as MP4, ~1080p, upload to the DoraHacks demo field (or link a
  YouTube unlisted video).

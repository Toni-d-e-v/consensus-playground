# PHASES-TO-COMPLETE — build instructions for the remaining phases

**Audience:** the Claude Code agent (Opus) continuing this project.
**Read first:** `SPEC.md` (the source of truth for everything below). `PHASE-2.md` documents the already-shipped Exhibit 1 and is a useful template for the level of detail each exhibit deserves.

## 0. Ground rules (non-negotiable)

1. **Work strictly phase by phase** (SPEC §11). Finish a phase — tests green in CI, deployed, verified live — before starting the next. Do not batch phases into one commit.
2. **Never violate engine purity** (SPEC §4): `src/engine/**` has no React, no DOM, no `Math.random`, no `Date.now`/`performance.now`. ESLint enforces it and `tests/engine-purity.test.ts` tests the enforcement. All randomness through the injected `Rng`; all time is logical ticks.
3. **Determinism is the product.** Same seed + config + commands ⇒ byte-identical event logs, always. Every new protocol gets a determinism matrix test before any UI work.
4. **Deploy = push to `main`.** CI (`.github/workflows/ci.yml`) lints, tests, builds, and deploys to GitHub Pages. Live: https://toni-d-e-v.github.io/consensus-playground/ · Repo: https://github.com/Toni-d-e-v/consensus-playground

## 1. What already exists (Phases 0–2, shipped)

- **Engine core** (`src/engine/core/`): `rng.ts` (mulberry32), `simulation.ts` (tick loop), `network.ts` (latency/jitter/loss/partitions), `eventlog.ts`, `adversary.ts` (seeded faulty selection), `sharecodec.ts` (base64url run encoding), `types.ts` (all shared types incl. `Protocol<VM>`).
- **The replay architecture** — understand this before writing code: live control changes and UI actions are recorded as tick-stamped `LiveCommand`s. `Simulation.pushCommand` only *records*; the command applies at the start of the next `step()`, which is exactly where a replay applies it. Replay, history scrubbing, reset, and share URLs are all the same operation: re-run from tick 0 with config + commands. Never add UI-triggered engine mutations that bypass `pushCommand`.
- **Protocols** (`src/engine/protocols/`): `echo.ts` (determinism harness dummy), `lamport.ts` (Exhibit 1 — read it as the reference implementation of the `Protocol<VM>` interface, including the `action()` hook for UI-triggered attacks and node-0-anchored view models).
- **UI framework**: `src/app/createSimStore.ts` (Zustand store factory + rAF driver — one instance per exhibit, engine lives in a closure, never in React state); `src/components/` (`ExhibitShell` with slots, `ChaosControls` + `ChaosSlider`, `TransportBar` with event-blip scrubber, `StoryFeed`, `SimplificationsPanel`, `RunSharing`, `GuidedIntro`).
- **Exhibit 1** (`src/exhibits/ex1-time/`): the complete worked example — `presets.ts`, `story.ts` (event log → story feed + scrubber markers), `Ex1Stage.tsx` (SVG), `Ex1Time.tsx` (composition).
- **Tests** (`tests/`): determinism harness, engine purity, protocol suite (`tests/protocols/lamport.test.ts` — copy its structure per protocol), shell smoke test.

### The recipe for a new exhibit (distilled from Exhibit 1)

1. Protocol module in `src/engine/protocols/<name>.ts`: config interface extending `ProtocolConfig`, serializable node state, `init/onTick/onMessage`, optional `action()` for the hero button, `snapshotView` (plain serializable VM — the UI never touches node state), `invariants`.
2. `tests/protocols/<name>.test.ts` BEFORE UI: determinism matrix over the exhibit's presets × 25 seeds run twice; invariants over ≥100 seeds (500 for BFT safety, SPEC §10.2); scripted attack-outcome tests (SPEC §10.3); share-URL replay test.
3. `src/exhibits/<id>/`: `presets.ts` (3–5 named SimConfigs), `story.ts`, `<Name>Stage.tsx` (SVG), `<Name>.tsx` composing `ExhibitShell` + `createSimStore(protocol, defaultPreset)`.
4. Route in `src/app/App.tsx`, chapter card set live in `src/app/Home.tsx`.
5. Guided intro (3 coach marks), simplifications panel content with paper links (SPEC §7.6), metrics strip (2–4 numbers).
6. Verify in a real browser before pushing (see §7 below), then commit, push, confirm CI + live site.

## 2. NEW cross-cutting requirement: protocol explainers

**Every exhibit must explain its protocol and where it is used in the real world.** Two surfaces:

1. **Home page chapter cards** (`src/app/Home.tsx`): each card gets, beneath the title/hook, one plain-English line saying what the protocol is, plus small "used by" chips (monospace, muted). Visible without interaction — this is the card content, not a tooltip.
2. **In-exhibit "About this protocol" panel**: a shared collapsible component (build `src/components/ProtocolInfo.tsx`, styled like `SimplificationsPanel`, rendered next to it in the shell's `panel` slot). Content per exhibit: *What it is* (2–3 sentences, lab-notebook voice per SPEC §9 — plain, active, slightly wry), *How this exhibit models it* (1–2 sentences), *Where it's used* (named real systems), and a link to the primary paper/docs.

Retrofit Exhibit 1 with both surfaces as part of Phase 3 (small task, do it first). Reference facts to use:

| Exhibit | Protocol | Where it's used (real systems) |
|---|---|---|
| Ex1 Time & ordering | Lamport logical clocks / quorum snapshots | Logical clocks underpin virtually all distributed systems: version vectors in Dynamo-style DBs (Cassandra, Riak), CRDTs, Spanner's TrueTime is the engineering answer to the same problem |
| Ex2 Fork wars | Nakamoto consensus (PoW longest chain) | Bitcoin, Litecoin, Dogecoin, Monero; Ethereum before the 2022 Merge |
| Ex3 BFT rounds | Tendermint (PBFT lineage) | Cosmos Hub and all CometBFT chains (dYdX v4, Celestia's consensus layer, Injective); conceptual ancestor: PBFT |
| Ex4 DAG snapshots | Narwhal-style round DAG | Sui (Narwhal/Bullshark → Mysticeti), Aptos (Quorum Store descends from Narwhal) |
| S1 Proof of History | PoH sequential hash clock | Solana |
| S2 Leader pipeline | Single-leader slot schedule | Solana (leader schedule, Gulf Stream/Turbine simplified away) |
| S3 Finality race | Alpenglow (Votor) vs TowerBFT | Solana's consensus upgrade — **read the Alpenglow whitepaper before implementing (SPEC §7.5 S3 makes this mandatory)** and record deviations in the panel |

## 3. Phase 3 — Exhibit 2: Fork wars (PoW)

Implement SPEC §7.2 exactly. Key points and decisions already settled:

- `nakamoto.ts`: per tick each node mines with probability ∝ hashrate share (seeded). Honest nodes have equal hashrate; the attacker slider reallocates share. Blocks reference parents; longest chain by height, ties first-seen. Propagation through the existing network layer — latency creates natural forks, that's the point.
- Adversary behaviors: `double_spender` (private fork from a marked tx, publish when longer — wire "Attempt double-spend" through the `action()` hook exactly like Ex1's forge) and `withholder` (selfish-mining-lite: publish on tie).
- ViewModel: block tree (id, parent, height, miner, orphaned flag, private flag). Stage: tree growing left→right, main chain bold, orphans fade gray, attacker's private chain dashed red and hidden below a fold until published. Confirmation counter on the victim tx.
- Metrics: orphan rate · attacker chain deficit/lead · double-spends succeeded. Presets per §7.2 (incl. "Baby PoW chain"). Hero control: attacker hashrate 0–60%.
- Invariant test (SPEC §7.2): with adversary <33% and default latency, double-spend success over 1000 seeded runs <5% at 6 confirmations; honest chain height monotonic. This is the slow test — keep single runs short (a few hundred ticks).
- Simplifications panel + ProtocolInfo (Bitcoin whitepaper, selfish mining paper links).
- Gate: tests green, deployed, both drama moments verified in a real browser (natural fork at high latency; 51% double-spend reveal).

## 4. Phase 4 — Exhibit 3: BFT voting rounds

SPEC §7.3. Simplified Tendermint: rotating proposer, propose → prevote → precommit → commit at ≥2/3 precommits, timeout → round change.

- Faulty-node count stepper must display f, N, and ⌈2/3⌉ explicitly (the one-third boundary is the aha).
- `equivocator` with "evidence detection on/off" toggle: when off and adversaries >1/3, allow the visible safety violation (two conflicting commits + huge red banner). `offline` for liveness stalls. "Kill the proposer" via `action()`.
- Stage: nodes in a ring, proposer highlighted, votes fly as dots (use the message queue via `Simulation.pendingMessages()` for in-flight rendering), tally bars filling toward the 2/3 line, committed blocks stacking right.
- Property test: with ≤f faulty, exactly one block per height across all honest nodes, **500 seeds** (SPEC §10.2).
- Presets per §7.3. ProtocolInfo: Tendermint paper; used by Cosmos/CometBFT chains.

## 5. Phase 5 — Exhibit 4: DAG snapshots

SPEC §7.4. `dagrounds.ts`: one vertex per node per round with refs to ≥⌈2/3·N⌉ previous-round vertices; advance on ⌈2/3·N⌉ received. Deterministic ordering: rounds in order, within round by NodeId (disclose vs anchor-based ordering).

- Requires a **minimal** `leader.ts` for race mode (a second `Simulation` running in parallel on identical inputs — two engine instances, same seed, split stage, dueling TPS counters). The full leader exhibit is S2; keep this version minimal.
- Stage: matured Ex1 lattice + the "ordering wavefront" line linearizing vertices into an output tape.
- Invariant: all honest nodes emit an identical output-tape prefix (property test).
- ProtocolInfo: Narwhal & Tusk + Mysticeti papers; used by Sui, Aptos.

## 6. Phase 6 — Solana wing (build order: S1 → S3 → S2)

SPEC §7.5. S1 is self-contained; S3 is highest-impact; S2 needs the most plumbing.

- **S1 PoH**: single generator hashing 1/tick; "Forge history" races attacker recompute (≤3× speed slider) vs advancing head — show the catch-up math live. Ties conceptually back to Ex1 Mode A (same attack succeeds there).
- **S3 Alpenglow**: **read the Alpenglow whitepaper first** — accuracy is the moat (SPEC §7.5). Fast path ≥80% first-round, fallback ≥60% second round, else skip; legacy side vote-stacking to depth 32. Split-screen stopwatches with tick↔ms scale display. Test the threshold behaviors (§10.3: fast path at ≥80%, fallback at ≥60%, honest liveness stall past documented thresholds).
- **S2 Leader pipeline**: extend the minimal `leader.ts`; `offline` → skipped slot, `censor` → flagged tx dropped then included by next honest leader (the glowing-dot moment). Include the "coming soon: multiple concurrent proposers" teaser card.

## 7. Phase 7 — Home page + polish pass

SPEC §8, §12. Hero = ambient auto-running muted Ex1 lattice (reuse `Ex1Stage` with a tiny store, no controls). Five-chapter path with hooks + the protocol explainer lines (§2 above). Footer: GitHub link, papers list, author credit. Then: a11y audit (keyboard operability, focus states, dash patterns so color is never the only encoding), mobile presets pass, performance profiling against SPEC §5.8, per-exhibit titles + OG images.

## 8. Verification playbook (use it every phase)

- Local gate: `npm run lint && npm test && npm run build` (build includes `tsc --noEmit` — **vitest does not type-check**, so don't trust green tests alone).
- Real-browser check: `playwright-core` + system Chrome (`/usr/bin/google-chrome`) drives the built app via `npm run preview`. Plain headless `--screenshot` does NOT pump `requestAnimationFrame` — the sim will look frozen; use Playwright and interact. Write a throwaway script in the session scratchpad (see the Phase 2 pattern: arm the hero button, fire the attack, assert the story-feed text and metrics).
- E2E caught a real bug unit tests missed in Phase 2 (UI armed an action whose engine-side target didn't exist yet). Always drive the exhibit's headline moment end-to-end before pushing.
- Deploy quirks: `gh` CLI is v2.4 (old syntax; `gh repo create` doesn't add remotes). GitHub Pages deploys occasionally fail transiently ("Deployment failed, try again later") — rerun failed jobs via `gh api -X POST repos/{o}/{r}/actions/runs/{id}/rerun-failed-jobs`. Deep links return HTTP 404 but render (404.html SPA fallback) — expected.
- Definition of done per exhibit (SPEC §11): presets work · guided intro works · share URL replays · invariant tests green · simplifications panel filled · ProtocolInfo filled (§2) · 60fps at default config · deployed and verified live.

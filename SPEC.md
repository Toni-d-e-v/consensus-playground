# Consensus Playground — Project Specification

**Version:** 1.0
**Owner:** [your name]
**Purpose of this document:** Complete build spec for Claude Code. Follow phases in order. Do not start a later phase until the previous phase's acceptance criteria pass.

---

## 1. What this is

Consensus Playground is an interactive, browser-based simulator that teaches how blockchain consensus algorithms work by letting users *operate* them: inject latency, partition networks, control adversaries, and watch ordering, forks, votes, and finality happen visually in real time.

It is a static frontend app. No backend, no real blockchain, no wallets. All "nodes" are simulated in the browser.

**The narrative arc of the site (exhibit order matters):**
1. Time & ordering — why "what happened first" is the core problem
2. Fork wars (Proof of Work) — Nakamoto's answer
3. BFT voting rounds — the classical answer
4. DAG snapshots — the parallel answer
5. Solana wing: Proof of History, the single-leader pipeline, and the Alpenglow finality race — the frontier

**Audience:** developers and technically curious people who have heard of blockchains but never *felt* how consensus works. Every exhibit is built around one "aha" moment, not around completeness.

**Success criteria for the whole project:**
- A first-time visitor understands the exhibit's core idea within 60 seconds of interaction without reading any docs.
- Any simulation run is reproducible: same seed + same config = identical run, always.
- Each exhibit produces at least one shareable moment (a URL that replays a specific run).

## 2. Non-goals (do not build)

- No real networking, WebRTC, or servers. Simulation is in-process only.
- No cryptography beyond cheap stand-ins (a "hash" can be a seeded PRNG value or a real but fast hash like xxhash/sha-256 via SubtleCrypto — pick one, it only needs to *look* right).
- No user accounts, no persistence beyond URL params.
- No token, no wallet connection, nothing on-chain.
- No mobile-first heroics: must be *usable* on mobile (read + tap presets), but the full control surface targets desktop.
- No exhaustive protocol fidelity. Each exhibit models the *mechanism being taught* faithfully and simplifies everything else. Simplifications must be listed in the exhibit's "What we simplified" panel (see §7.6).

## 3. Tech stack

- **Language:** TypeScript, strict mode.
- **Framework:** React 18 + Vite. No Next.js (no SSR needed; static hosting).
- **Rendering:** SVG via React for exhibit visuals (nodes, messages, chains, DAGs). If profiling shows SVG can't hold 60fps at max entity counts (§5.8), switch that exhibit's canvas layer to HTML5 Canvas — but engine and UI stay identical.
- **State:** Zustand for UI state. The simulation engine itself is plain TypeScript, framework-free, zero React imports (see §4 — this is a hard rule).
- **Styling:** Tailwind CSS + a small set of CSS variables for the theme (see §9).
- **Animation:** CSS transitions + requestAnimationFrame-driven interpolation of engine states. No heavy animation libraries. Respect `prefers-reduced-motion`.
- **Testing:** Vitest. Determinism and protocol-logic tests are mandatory (see §10).
- **Deployment:** static build, deployable to GitHub Pages / Cloudflare Pages. Include a GitHub Actions workflow for build + test + deploy.
- **Repo:** single package. No monorepo tooling.

## 4. Architecture: one engine, thin exhibits

This is the load-bearing design decision:

> The simulation engine is a single, deterministic, framework-free TypeScript library. Every exhibit is a *configuration* of that engine plus a visual skin. Exhibits do not implement their own event loops, RNG, or message delivery.

```
src/
  engine/            # pure TS, no React, no DOM
    core/
      simulation.ts      # tick loop, event queue, lifecycle
      rng.ts             # seeded PRNG (mulberry32 or sfc32)
      network.ts         # message delivery: latency, loss, partitions
      adversary.ts       # adversary behavior framework
      eventlog.ts        # append-only log of everything that happened
      types.ts           # core shared types
    protocols/
      lamport.ts         # logical clocks / quorum snapshots (Exhibit 1)
      nakamoto.ts        # PoW longest-chain (Exhibit 2)
      tendermint.ts      # simplified BFT rounds (Exhibit 3)
      dagrounds.ts       # Narwhal-style round DAG (Exhibit 4)
      poh.ts             # Proof of History chain (Exhibit S1)
      leader.ts          # single-leader slots (Exhibit S2)
      alpenglow.ts       # simplified Votor voting (Exhibit S3)
  exhibits/
    ex1-time/          # each exhibit: config + React components only
    ex2-forks/
    ex3-bft/
    ex4-dag/
    s1-poh/
    s2-leader/
    s3-alpenglow/
  components/          # shared UI: ChaosControls, TimelineScrubber, NodeGraph,
                       # MessageLayer, RunSharing, SimplificationsPanel
  app/                 # routing, home page, exhibit shell
  theme/
tests/
  determinism.test.ts
  protocols/           # one test file per protocol
```

**Hard rules:**
- `src/engine/**` must never import from React, the DOM, or `src/exhibits/**`. Add an ESLint rule enforcing this.
- All randomness in the engine goes through the injected seeded RNG. `Math.random()` is banned in `src/engine/**` (ESLint rule).
- All time in the engine is logical ticks. `Date.now()` and `performance.now()` are banned in `src/engine/**`. Wall-clock exists only in the rendering layer for animation smoothing.

## 5. Simulation engine spec

### 5.1 Core types

```ts
type NodeId = number;
type Tick = number;        // logical time, starts at 0
type Seed = number;

interface SimConfig {
  seed: Seed;
  nodeCount: number;                 // 4..64
  adversary: AdversaryConfig;        // see 5.5
  network: NetworkConfig;            // see 5.4
  protocol: ProtocolConfig;          // per-protocol params, discriminated union
  maxTicks: number;                  // safety cap, default 10_000
}

interface Message {
  id: number;                        // monotonically increasing
  from: NodeId;
  to: NodeId;                        // engine expands broadcasts into unicasts
  sentAt: Tick;
  deliverAt: Tick;                   // computed by network layer at send time
  payload: ProtocolPayload;          // protocol-specific, serializable
}

interface SimNode {
  id: NodeId;
  faulty: boolean;                   // controlled by adversary
  state: ProtocolNodeState;          // protocol-specific, serializable
}

interface SimEvent {                 // everything notable that happened
  tick: Tick;
  kind: string;                      // e.g. "msg_sent", "msg_delivered",
                                     // "block_mined", "vote_cast", "finalized",
                                     // "fork_created", "fork_orphaned",
                                     // "snapshot_closed", "attack_attempted",
                                     // "attack_succeeded", "attack_failed"
  data: Record<string, unknown>;     // serializable details
}
```

### 5.2 Protocol interface

Every protocol implements the same interface so the shell, scrubber, and sharing work identically everywhere:

```ts
interface Protocol<S extends ProtocolNodeState, P extends ProtocolPayload> {
  name: string;
  init(config: SimConfig, rng: Rng): S[];                 // initial node states
  onTick(node: SimNode, tick: Tick, ctx: ProtocolCtx): void;
  onMessage(node: SimNode, msg: Message, ctx: ProtocolCtx): void;
  // ctx provides: send(to|broadcast, payload), emit(event), rng, config
  snapshotView(nodes: SimNode[], tick: Tick): ViewModel;   // what the UI renders
  invariants(nodes: SimNode[]): InvariantResult[];         // safety checks, used in tests AND shown in UI
}
```

`snapshotView` returns a plain serializable ViewModel per protocol (chain trees, DAG layers, vote tallies). The React layer renders ViewModels only — it never reaches into node state.

### 5.3 Tick loop & determinism

- `advanceTick()`: (1) deliver all messages with `deliverAt === tick` in ascending `Message.id` order; (2) call `onTick` on every node in ascending `NodeId` order; (3) run adversary hooks; (4) append events; (5) increment tick.
- Iteration order is always explicit and sorted. Never iterate over Map/Set insertion order for anything that affects outcomes.
- The engine exposes: `run(untilTick)`, `step()`, `reset()`, `getEvents()`, `getViewModel()`.
- **Replay = re-run.** History scrubbing re-executes from tick 0 to the target tick (it's cheap at these scales). Optionally cache ViewModel snapshots every N ticks for scrub performance; caching must not affect outcomes.

### 5.4 Network model (`NetworkConfig`)

- `baseLatency: number` (ticks, default 3) and `jitter: number` (± ticks, drawn from seeded RNG per message).
- `lossRate: 0..1` — message silently dropped (still logged as event `msg_lost`).
- `partitions: NodeId[][] | null` — nodes in different groups cannot exchange messages while the partition is active; messages are dropped with event `msg_partitioned`. Partitions can be toggled live; toggling is itself an event so replays capture it. **Live control changes during a run are recorded as timestamped config events and are part of the replay** (see 5.7).
- `clockDrift: number` — max per-node wall-clock skew in ticks, used only by protocols that (wrongly) trust wall clocks (Exhibit 1 mode A). Each node gets a stable per-run drift drawn from the seeded RNG.

### 5.5 Adversary model (`AdversaryConfig`)

- `fraction: 0..1` — portion of nodes marked faulty (rounded down; selection is seeded).
- `behavior`: protocol-specific union, e.g. `"timestamp_liar" | "withholder" | "double_spender" | "censor" | "equivocator" | "offline"`.
- Adversary logic lives in the protocol module (it needs protocol knowledge) but is activated/configured through this shared config so the UI control is uniform.
- Adversaries act deterministically given the seed.

### 5.6 Event log & metrics

- Append-only `SimEvent[]`. This is the single source of truth for the timeline scrubber, the metrics panel, and the "story feed" (a human-readable running commentary: "Node 3 mined a block", "Fork! Two chains at height 12", "Snapshot 8 closed with 7/9 vertices").
- Derived metrics computed from events per exhibit: e.g. time-to-finality, orphan rate, throughput (tx/tick), attack success count.

### 5.7 Run sharing

- Full run state = `SimConfig` + ordered list of live control-change events. Serialize to a compact JSON, base64url-encode, put in the URL hash. "Share this run" button copies the URL. Loading a share URL reconstructs and replays the run exactly.
- Cap encoded size; if exceeded, share only the initial config and warn.

### 5.8 Performance budgets

- 60fps target with: 32 nodes, 200 in-flight messages, 500 rendered chain/DAG elements. Beyond that, virtualize/aggregate visuals (e.g. collapse old history).
- Engine `advanceTick` for max config must complete in < 1ms average (it's trivial logic; this is easily achievable — the budget exists to catch accidental O(n²) explosions).

## 6. Shared UI shell (all exhibits)

Every exhibit renders inside the same shell:

- **Stage** (center): the exhibit's visual. SVG.
- **Chaos controls** (right sidebar, consistent order across exhibits): Latency slider · Jitter · Message loss · Partition toggle (with a node-group picker) · Adversary % slider · Adversary behavior select · Seed input + "reroll" · Speed (0.25×–8×) .
  Controls not meaningful for an exhibit are hidden, never disabled-but-visible.
- **Transport bar** (bottom): Play/Pause · Step (+1 tick) · Reset · Timeline scrubber with event markers (forks, finalizations, attacks get colored ticks on the scrubber) · current tick readout.
- **Story feed** (left, collapsible): human-readable event commentary, auto-scrolling, click an entry to jump the scrubber to that tick.
- **Metrics strip** (top of stage): 2–4 big live numbers per exhibit (defined per exhibit below).
- **"What we simplified" panel**: collapsible footnote listing every simplification vs. the real protocol, with links to the real papers. This is a credibility feature — treat it as mandatory, not optional polish.
- **Preset buttons** (top): each exhibit ships 3–5 named presets ("Happy path", "Laggy network", "51% attacker"…). Presets are just SimConfigs; they are the primary mobile experience.
- **Guided intro**: on first visit to an exhibit, a 3-step coach-mark sequence (what you're looking at → the one control to try → the thing to watch for). Skippable, never shown again per exhibit (localStorage flag).

## 7. Exhibit specifications

Each exhibit lists: the aha moment, the model, controls, visuals, metrics, presets, acceptance criteria, and simplifications.

### 7.1 Exhibit 1 — Time & ordering (MVP — build first)

**Aha moment:** the same timestamp-forgery attack succeeds under wall-clock snapshot boundaries and becomes impossible under quorum boundaries.

**Model (protocol `lamport.ts`):** N nodes emit transactions. Transactions are grouped into snapshots (vertical layers). Two boundary modes:
- **Mode A — Wall clock:** a snapshot closes every `snapshotTicks` ticks *according to each node's drifted local clock*. A transaction claims a timestamp from its creator's local clock; placement into a snapshot trusts that claim.
- **Mode B — Quorum (logical time):** snapshot R closes for a node once it has received transactions/acks referencing snapshot R−1 from ≥ ⌈2/3·N⌉ distinct nodes. Transactions carry references to (hashes of) transactions in the previous snapshot instead of timestamps.

**The attack ("Forge the past" button):** the adversary observes a target transaction T in snapshot K, then creates transaction T′ claiming to precede T.
- Mode A: T′ carries a lied timestamp inside snapshot K−1 → accepted → event `attack_succeeded`, the visual shows T′ sliding into an earlier column and history reordering (affected edges flash red).
- Mode B: T′ cannot reference snapshot K−1's closed quorum set retroactively (its references reveal it was created after K closed) → rejected → event `attack_failed`, visual shows T′ bouncing off the boundary.

**Controls:** mode toggle (A/B — the hero control, styled prominently), clock-drift slider (Mode A only), snapshot length, standard chaos controls, "Forge the past" button.

**Visuals:** columns = snapshots (closed ones get a solid border, open one is dashed); dots = transactions colored by originating node; curved edges = references to the previous snapshot; drifting per-node clock faces along the left edge in Mode A.

**Metrics:** snapshots closed · attacks attempted / succeeded · avg tx per snapshot.

**Presets:** "Perfect clocks" (drift 0 — even Mode A looks fine: sets up the lie), "Real world" (drift + jitter — Mode A quietly reorders), "The heist" (max drift, adversary on, one click from the attack), "Safety on" (Mode B, same chaos, attack fails).

**Invariants (tested):** Mode B: no transaction ever moves to an earlier snapshot after that snapshot closed; a snapshot never closes with < ⌈2/3·N⌉ contributors.

**Simplifications to disclose:** no signatures (identity is assumed honest except adversary), quorum snapshots are a teaching simplification of Lamport clocks + round-based DAG certificates, no data availability concerns.

**Acceptance criteria:**
- Same seed + preset ⇒ byte-identical event log across 100 runs (automated test).
- "The heist" preset: attack succeeds in Mode A and fails in Mode B with no other config change.
- A user can go from page load to witnessing both attack outcomes in under 90 seconds using only presets + the two buttons.

### 7.2 Exhibit 2 — Fork wars (Proof of Work)

**Aha moment:** dragging attacker hashrate past ~50% flips double-spends from improbable to routine.

**Model (`nakamoto.ts`):** per tick, each node mines with probability proportional to its hashrate share (seeded). Blocks reference a parent; longest chain (by height, ties by first-seen) wins; propagation uses the network layer, so latency creates natural forks. Adversary behavior `double_spender`: mines privately from a fork point, publishes when its private chain is longer. `withholder`: selfish-mining-lite (publish on tie).

**Controls:** attacker hashrate slider 0–60% (hero control), block interval, standard chaos. Button: "Attempt double-spend" (marks a victim tx, starts the private fork; outcome is announced in the story feed).

**Visuals:** living block-tree growing left→right; main chain bold, orphans fade gray; the private attacker chain renders dashed red and *hidden below a fold* until published (reveal is the drama). Confirmation counter on the victim tx.

**Metrics:** orphan rate · current attacker chain deficit/lead · double-spends succeeded.

**Presets:** "Solo miners", "High latency = natural forks", "10% attacker (safe-ish)", "51% attacker", "Baby PoW chain" (tiny total hashrate + cheap rental note — the Promethium-critique preset).

**Invariants:** with adversary < 33% and default latency, double-spend success rate over 1000 seeded runs < 5% at 6 confirmations; honest chain height is monotonic.

**Simplifications:** no difficulty adjustment (fixed per preset), no mempool/fees, tie-breaking is first-seen.

### 7.3 Exhibit 3 — BFT voting rounds

**Aha moment:** f faulty nodes are harmless; f+1 breaks liveness or safety — the one-third boundary is visible, not asserted.

**Model (`tendermint.ts`):** simplified Tendermint: rotating proposer per round, propose → prevote → precommit → commit on ≥2/3 precommits; timeout → round change. Adversary behaviors: `offline` (silent), `equivocator` (conflicting votes to different peers — with a teaching toggle "evidence detection on/off"; when off and adversaries > 1/3, allow a visible safety violation: two conflicting commits, huge red banner).

**Controls:** faulty-node count stepper (shows f, N, and the ⌈2/3⌉ threshold explicitly), kill-proposer button, timeout length, standard chaos.

**Visuals:** nodes in a ring; proposer highlighted; vote messages fly as dots; per-round tally bars filling toward the 2/3 line; committed blocks stack on the right.

**Metrics:** rounds per commit · commits · safety violations.

**Presets:** "Happy path", "Dead proposer", "f faulty (fine)", "f+1 faulty (stall)", "Equivocation catastrophe".

**Invariants:** with ≤ f faulty, exactly one block commits per height across all honest nodes, always (property-tested across 500 seeds).

**Simplifications:** no locking/valid-round subtleties, no evidence slashing, uniform stake.

### 7.4 Exhibit 4 — DAG snapshots (Narwhal-style rounds)

**Aha moment:** side-by-side throughput race — single-leader chain vs. round-DAG under the same load and latency; the DAG's TPS counter pulls away.

**Model (`dagrounds.ts`):** each node produces one vertex per round containing a batch of txs and references to ≥ ⌈2/3·N⌉ vertices of the previous round; a node advances rounds on receiving ⌈2/3·N⌉ vertices. Deterministic ordering rule: rounds in order; within a round, vertices sorted by NodeId (disclose the simplification vs. anchor-based ordering). Race mode runs `leader.ts` in parallel on identical inputs.

**Controls:** batch size, node count, race-mode toggle (hero), standard chaos.

**Visuals:** this is Exhibit 1's layer visual, matured: vertex lattice with reference edges; a sweeping "ordering wavefront" line that linearizes vertices into an output tape at the bottom. Race mode splits the stage.

**Metrics:** tx/tick both sides · rounds/sec · reference density.

**Presets:** "Calm lattice", "Race: DAG vs leader", "Laggy but alive", "A third asleep".

**Invariants:** all honest nodes emit the identical output tape prefix (property-tested).

**Simplifications:** no certificates/signatures, simplified ordering rule, no garbage collection.

### 7.5 Solana wing

#### S1 — Proof of History
**Aha moment:** "Forge history" fails because sequential hashing can't be outrun.
**Model (`poh.ts`):** one PoH generator node hashing per tick (hash = seeded stand-in); incoming txs get woven into the stream at the current index. Attack: adversary tries to insert a tx k positions in the past → must recompute k hashes while the honest stream advances 1/tick with a head start; race meter shows attacker position vs. stream head; attacker hash speed slider (up to 3×) still loses for meaningful k — show why (catch-up math displayed live).
**Controls:** insertion-depth slider, attacker speed slider, "Forge history" button, toggle "vs. wall-clock timestamps" (links conceptually to Exhibit 1 Mode A, where the same attack succeeds).
**Visuals:** horizontal hash conveyor; woven txs as amber beads; attack renders a red parallel recompute track visibly falling behind.
**Metrics:** stream head index · attacker gap · forgeries blocked.
**Simplifications:** single generator (no validator verification split), hash function is simulated-cost, no VDF details.

#### S2 — The single-leader pipeline
**Aha moment:** throughput stays flat as load rises (no per-tx voting), but one malicious leader can censor you for a whole slot.
**Model (`leader.ts`):** slot schedule round-robins leaders; leader ingests global tx stream, produces blocks each tick of its slot; others confirm passively (voting abstracted). Behaviors: `offline` leader → skipped slot; `censor` leader → drops flagged tx.
**Controls:** load slider (hero), kill-leader button, "flag my transaction" + censor toggle, slot length.
**Visuals:** conveyor of slots across the top; your flagged tx as a glowing dot visibly dropped by the red leader, then included by the next honest one.
**Metrics:** TPS · skipped slots · your tx's wait time.
**Simplifications:** no Turbine/Gulf Stream detail, no stake-weighted schedule, voting abstracted. Include a "coming soon: multiple concurrent proposers" teaser card.

#### S3 — The finality race (TowerBFT vs Alpenglow-style voting)
**Aha moment:** split-screen stopwatch: legacy side finalizes in ~12.8s-equivalent ticks; Alpenglow side in ~150ms-equivalent — the user *feels* two orders of magnitude.
**Model (`alpenglow.ts`):** simplified Votor: fast path finalizes on ≥80% first-round votes; fallback second round at ≥60%; else skip. Legacy side: vote-stacking depth counter to 32. Resilience toggle: knock 20% of stake offline (fast path fails, fallback still finalizes); push adversarial+offline past documented thresholds and show liveness stall honestly.
**Controls:** send-transaction button (hero — starts both stopwatches), offline-stake slider, adversary-stake slider, tick↔ms scale display.
**Visuals:** split stage, two stopwatches, vote meters filling to 80%/60% lines on the right, depth counter climbing to 32 on the left.
**Metrics:** finality time both sides · fast-path vs fallback ratio.
**Simplifications (extra prominent here):** this is a *teaching model* of Votor, not the protocol; no Rotor/dissemination modeling; thresholds per the Alpenglow paper — **builder must read the actual Alpenglow whitepaper before implementing and record any deviations in the panel.** Accuracy is the moat: getting the voting paths subtly wrong is the difference between "impressive" and "wrong".

### 7.6 "What we simplified" panel — content rule

Every simplification listed above must appear in the exhibit's panel with one-line explanations and links to: Lamport 1978 (Ex1), Bitcoin whitepaper + selfish mining paper (Ex2), Tendermint paper (Ex3), Narwhal&Tusk + Mysticeti papers (Ex4), Solana PoH docs (S1), Solana architecture docs (S2), Alpenglow whitepaper (S3).

## 8. Home page

- Hero: a small ambient live sim (Exhibit 1's lattice, auto-running, muted colors) — the site demos itself.
- The five-chapter narrative as a horizontal path with one-line hooks per exhibit ("There is no such thing as 'at the same time'" → "Longest chain wins. Usually." → "Why one-third is a magic number" → "What if everyone proposes at once?" → "Solana: manufacturing time itself").
- Footer: GitHub link, papers list, author credit ("Built by [name], 18, Superteam Balkan").

## 9. Design language

Deliberate direction, not defaults: **"laboratory instrument"** — the site is an oscilloscope for consensus, not a marketing page.

- **Palette (dark-first):** near-black blue-gray background `#0E1116`; panel `#161B22`; primary ink `#E6EDF3`; instrument accent (honest activity) — phosphor teal `#2DD4BF`; adversary/danger — signal red `#F87171`; finalized/committed — amber `#FBBF24`; muted structure `#30363D`. Light mode optional post-v1.
- **Type:** display/UI — a grotesque with character (e.g. "Space Grotesk"); numerals & labels on instruments — monospace ("IBM Plex Mono") for the metrics strip, tick readouts, and story feed. No serif.
- **Signature element:** the **timeline scrubber styled as an instrument trace** — event markers as colored blips on a horizontal scan line, present on every exhibit. Spend polish there.
- **Motion:** messages ease along paths; state changes (fork, finalize, attack) get one deliberate 300ms emphasis, nothing looping decoratively. All motion gated behind `prefers-reduced-motion`.
- **Copy voice:** plain, active, slightly wry. Buttons say what they do ("Forge the past", "Kill the proposer", "Attempt double-spend"). The story feed narrates like a lab notebook, not a lecture.
- Avoid the templated AI look: no cream-and-terracotta, no generic gradient hero, no numbered 01/02/03 decoration unless the content is genuinely sequential (the chapter path is — that's fine).

## 10. Testing requirements (mandatory)

1. **Determinism:** for each protocol × each preset, run twice with the same seed and assert identical serialized event logs. Run the full matrix in CI.
2. **Protocol invariants:** implement each exhibit's invariants (§7) as property tests across ≥ 100 seeds (500 for BFT safety).
3. **Attack outcomes:** scripted tests asserting the headline behaviors (Ex1 heist succeeds in A / fails in B; Ex2 51% double-spend succeeds, 10% ≈ fails; Ex3 f ok / f+1 stalls; S1 forgery loses the race; S3 fast path at ≥80%, fallback at ≥60%).
4. **Engine purity:** ESLint rules banning Math.random, Date.now, performance.now, React imports in `src/engine/**` — CI-enforced.
5. **Share URLs:** encode → decode → replay equals original event log.

## 11. Build phases for Claude Code

Work strictly in order. Each phase ends with tests green and a working deploy.

- **Phase 0 — Skeleton (small):** Vite + TS + React + Tailwind + Vitest + ESLint rules (§10.4) + CI + empty exhibit shell with chaos controls and transport bar rendering (non-functional). Deployable.
- **Phase 1 — Engine core:** rng, network, tick loop, event log, adversary framework, share-URL codec. Determinism test harness passing on a dummy echo protocol.
- **Phase 2 — Exhibit 1 complete** (protocol + visuals + presets + guided intro + panel + tests §10.3 items for Ex1). **This is the public MVP — deploy and share it before continuing.**
- **Phase 3 — Exhibit 2.**
- **Phase 4 — Exhibit 3.**
- **Phase 5 — Exhibit 4** (reuses Ex1 visuals + adds race mode; requires `leader.ts` minimal version).
- **Phase 6 — Solana wing:** S1, then S3, then S2 (this order: S1 is self-contained; S3 is highest-impact; S2 needs the most plumbing).
- **Phase 7 — Home page + polish pass** (a11y audit, mobile presets pass, performance profiling against §5.8).

Definition of done per exhibit: presets work · guided intro works · share URL replays · invariant tests green · simplifications panel filled · 60fps at default config.

## 12. Accessibility & misc

- Full keyboard operability for transport bar and all controls; visible focus states.
- Color is never the only encoding: adversary elements also get a dash pattern; finalized elements a fill change.
- All big-number metrics get `aria-live="polite"` off by default with a toggle (screen-reader spam guard).
- `prefers-reduced-motion`: replace movement with step-wise state changes.
- SEO/meta: per-exhibit titles + OG images (static screenshots, added in Phase 7).

## 13. Out-of-scope backlog (do not build now, keep in README)

Multiple-concurrent-proposers exhibit · network split-brain exhibit · PoS stake-weighting overlays · classroom mode (instructor drives, students watch) · embeddable single-exhibit iframes for blog posts · localized copy (BHS translation).
# PHASE-2.md — Exhibit 1: Time & Ordering (public MVP)

**Prerequisites:** Phase 0 (skeleton) and Phase 1 (engine core) are complete: the tick loop, seeded RNG, network layer, adversary framework, event log, and share-URL codec exist and pass the determinism harness. This document is self-contained for Phase 2 but SPEC.md remains the source of truth for shared conventions (§4 hard rules, §5 engine API, §6 shell, §9 design, §10 testing).

**Goal of this phase:** ship Exhibit 1 publicly. One exhibit, polished, deployed, shareable. Nothing from later phases.

---

## 1. The exhibit in one paragraph

N simulated nodes emit transactions that fall into vertical time-slices ("snapshots"). The user flips between two ways of deciding when a snapshot closes: **Mode A (wall clock)** — each node trusts its own drifting local clock and transactions carry self-claimed timestamps; **Mode B (quorum / logical time)** — a snapshot closes only when ≥ ⌈2/3·N⌉ distinct nodes have contributed, and transactions carry hash-references to the previous snapshot instead of timestamps. A "Forge the past" button lets the adversary try to insert a transaction into an already-closed snapshot. In Mode A the forgery succeeds and history visibly reorders; in Mode B it bounces off. That flip is the entire point of the exhibit.

## 2. Protocol implementation — `src/engine/protocols/lamport.ts`

### 2.1 Config

```ts
interface LamportConfig {
  kind: "lamport";
  mode: "wallclock" | "quorum";
  snapshotTicks: number;      // Mode A: nominal snapshot length, default 8
  txRate: number;             // per-node probability of emitting a tx per tick, default 0.15
}
```

Global knobs reused from SimConfig: `network.clockDrift` (Mode A only), `adversary.fraction`, `adversary.behavior: "timestamp_liar"`.

### 2.2 Node state

```ts
interface LamportNodeState {
  localClockOffset: number;         // drawn once from seeded RNG in [-clockDrift, +clockDrift]; 0 in Mode B
  currentSnapshot: number;          // index of the snapshot this node is filling
  seenFrom: Set<NodeId>;            // Mode B: distinct contributors seen for currentSnapshot
  txLog: TxRecord[];                // all txs this node has accepted, with snapshot assignment
}

interface TxRecord {
  txId: string;                     // `${nodeId}-${counter}`
  origin: NodeId;
  claimedTimestamp?: number;        // Mode A only: origin's local time at creation
  refs?: string[];                  // Mode B only: txIds from previous snapshot (2..4 sampled, seeded)
  snapshot: number;                 // assignment at acceptance time
  forged: boolean;                  // adversary flag, drives red styling
}
```

### 2.3 Behavior per tick (`onTick`)

- With probability `txRate` (seeded RNG), the node creates a tx and broadcasts it.
  - Mode A: `claimedTimestamp = tick + localClockOffset`.
  - Mode B: `refs` = 2–4 txIds sampled (seeded) from the node's accepted txs of snapshot `currentSnapshot − 1` (empty for snapshot 0).
- Mode A snapshot advance: node moves to snapshot `floor((tick + localClockOffset) / snapshotTicks)` — drift means nodes disagree about boundaries; that disagreement is the lesson, do not "fix" it.
- Mode B snapshot advance: when `seenFrom.size ≥ ceil(2/3 * nodeCount)`, close the snapshot (emit `snapshot_closed` with `{snapshot, contributors}`), increment `currentSnapshot`, reset `seenFrom` to `{self}`.

### 2.4 Behavior per message (`onMessage`)

Payload is the TxRecord (without `snapshot`). Receiving node assigns the snapshot:
- Mode A: `snapshot = floor(claimedTimestamp / snapshotTicks)` — it trusts the claim. Accept unconditionally, even into snapshots the receiver considers past. If the assigned snapshot is lower than the highest snapshot in which the receiver already holds txs, emit `history_reordered` `{txId, intoSnapshot}`.
- Mode B: valid iff every id in `refs` is a tx the receiver has accepted in snapshot `s−1` where `s` is the receiver's assignment (`currentSnapshot` at receipt). If any ref points into a snapshot that closed before this tx could have been created (i.e., refs don't match the open frontier), reject: emit `tx_rejected` `{txId, reason:"stale_refs"}`. Otherwise accept into the open snapshot and add origin to `seenFrom`.

Simplification note (goes in the UI panel): Mode B is a teaching hybrid of Lamport logical clocks and round-based DAG certificates — one aggregated "view" per exhibit, no per-node divergent views rendered, no signatures, no data-availability handling.

### 2.5 The attack — "Forge the past"

Exposed as `attemptForge(targetSnapshot: number)` on the protocol, wired to a UI button. Uses the first adversary node.

- Pick as victim the most recent tx in `targetSnapshot` (default: `currentSnapshot − 1` of node 0's view). Emit `attack_attempted`.
- Mode A: adversary creates a tx with `claimedTimestamp` inside `targetSnapshot`, `forged: true`, broadcasts. Honest nodes accept (per 2.4) → after delivery, emit `attack_succeeded` `{txId, intoSnapshot}`. The forged tx now *precedes* the victim in every node's log.
- Mode B: adversary cannot produce refs into `targetSnapshot − 1`'s frontier because that snapshot's quorum closed and current honest nodes only accept refs matching the open frontier; its best attempt references what it actually saw → every honest node rejects with `stale_refs` → emit `attack_failed`.
- Rate-limit: one forge attempt per 20 ticks (prevents spam from breaking the story feed).

### 2.6 `snapshotView` (ViewModel)

Render from node 0's accepted log plus global events (one aggregated view; per-node views are out of scope):

```ts
interface LamportViewModel {
  mode: "wallclock" | "quorum";
  snapshots: Array<{
    index: number;
    closed: boolean;
    contributors?: number;          // Mode B
    txs: Array<{ txId: string; origin: NodeId; forged: boolean; justMoved: boolean }>;
  }>;
  edges: Array<{ fromTx: string; toTx: string }>;   // Mode B refs, victim/forged relation in Mode A
  clocks?: Array<{ nodeId: NodeId; offset: number }>; // Mode A
  counters: { snapshotsClosed: number; attacksAttempted: number; attacksSucceeded: number; avgTxPerSnapshot: number };
}
```

### 2.7 Invariants (`invariants()`)

- **Q1 (Mode B):** no accepted tx's snapshot index ever decreases after assignment, and no tx is ever added to a snapshot after its `snapshot_closed` event.
- **Q2 (Mode B):** every `snapshot_closed` has `contributors ≥ ceil(2/3 * nodeCount)`.
- **A1 (Mode A, documentation of brokenness):** with `clockDrift > 0` and a `timestamp_liar` adversary, at least one `history_reordered` occurs within 300 ticks (this asserts the lesson reproduces).

## 3. UI — `src/exhibits/ex1-time/`

Renders inside the shared shell (SPEC §6): chaos sidebar, transport bar, story feed, metrics strip, presets, guided intro, simplifications panel.

### 3.1 Stage layout

- Horizontal band of snapshot columns, newest on the right, auto-scrolling; keep the last ~10 visible, older collapse into a compact "history strip".
- Column styling: closed = solid 1px border (`#30363D`), open = dashed border, header shows index and (Mode B) a contributor meter filling toward the ⌈2/3⌉ line in phosphor teal `#2DD4BF`.
- Transactions = 10px dots, colored per origin node (generate a stable categorical palette from nodeId; adversary nodes always signal red `#F87171` and additionally dash-ringed — color is never the only encoding).
- Mode B: curved SVG edges from each tx to its refs in the previous column, 1px, 35% opacity.
- Mode A: left rail of small clock faces per node, hands rotated by `tick + offset`; drifted clocks visibly diverge as drift rises.
- Attack animations (300ms, gated by `prefers-reduced-motion` → instant state change instead):
  - Success: forged dot slides from the right edge into the past column; affected edges flash red; a red blip lands on the timeline scrubber; story feed: "⚠ History reordered — tx {id} now 'precedes' {victim}".
  - Failure: dot flies toward the column, bounces off the closed border, dissolves; teal blip; story feed: "✓ Forgery rejected — refs reveal it was created after snapshot {k} closed".
- Hero control: the **Mode A/B toggle** — large segmented control at the top of the stage, labeled "Trust clocks" / "Trust quorums", with a one-line caption that changes per mode.
- "Forge the past" button: signal-red outline button next to the toggle; disabled during the 20-tick cooldown with a visible countdown.

### 3.2 Metrics strip

`Snapshots closed` · `Forgeries: succeeded/attempted` · `Avg tx / snapshot`. Monospace (IBM Plex Mono), aria-live off by default with a toggle.

### 3.3 Presets (exact configs)

| Preset | mode | nodes | drift | latency/jitter | adversary | notes |
|---|---|---|---|---|---|---|
| Perfect clocks | wallclock | 9 | 0 | 3/1 | 0% | Mode A looks fine — sets up the lie |
| Real world | wallclock | 9 | 6 | 4/3 | 0% | natural reordering appears without any attacker |
| The heist | wallclock | 9 | 10 | 4/3 | 11%, timestamp_liar | one click from a successful forge |
| Safety on | quorum | 9 | 10 | 4/3 | 11%, timestamp_liar | identical chaos, forge fails |

Preset buttons swap the full SimConfig and reset the run.

### 3.4 Guided intro (3 coach marks, first visit only)

1. "Each column is a snapshot of time. Dots are transactions." (points at stage)
2. "This toggle changes how a snapshot decides it's finished." (points at Mode toggle)
3. "Try to rewrite history." (points at Forge button)

### 3.5 Simplifications panel content

- No signatures; identity is honest except flagged adversaries.
- Quorum mode is a teaching hybrid of Lamport logical clocks (Lamport 1978, link) and round-based DAG certificates (Narwhal & Tusk, link).
- One aggregated view is rendered; real systems have per-node divergent views.
- No data-availability or gossip-completeness modeling.

## 4. Tests for this phase (all must pass in CI)

1. **Determinism matrix:** each of the 4 presets, same seed run twice ⇒ identical serialized event logs; repeat across 25 seeds.
2. **Invariants Q1, Q2:** property-tested across 100 seeds on "Safety on" (and Q1/Q2 on any quorum config with drift/jitter randomized from seed).
3. **Invariant A1:** "The heist" reproduces `history_reordered` within 300 ticks across 100 seeds.
4. **Attack outcomes:** scripted — on "The heist", `attemptForge` ⇒ `attack_succeeded`; on "Safety on", ⇒ `attack_failed`; asserted on identical seeds.
5. **Share URL:** encode "The heist" run with one live drift change and one forge ⇒ decode ⇒ replay ⇒ identical event log.
6. **Engine purity lint** (from Phase 0) still green.

## 5. Acceptance criteria (phase gate)

- All §4 tests green in CI.
- Deployed publicly (Pages) at the project URL; Exhibit 1 reachable from a minimal placeholder home page (full home page is Phase 7).
- Cold-start UX check: from page load, using only presets and the two hero controls, both attack outcomes witnessable in < 90 seconds.
- 60fps on the "Safety on" preset at 2× speed with 9 nodes (Chrome, mid-range laptop); no dropped-frame jank on attack animations.
- Guided intro shows once and never again (localStorage).
- `prefers-reduced-motion` verified: no positional animation, states still legible.
- Simplifications panel filled with the §3.5 content and working paper links.

## 6. Explicitly out of scope for this phase

Exhibits 2–4 and the Solana wing · race mode · per-node divergent views · light theme · OG images · mobile control surface beyond preset buttons working.

**When this phase is done: stop. Deploy. Share.** Do not begin Phase 3 in the same session.
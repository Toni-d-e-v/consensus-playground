import type {
  InvariantResult,
  Message,
  NodeId,
  Protocol,
  ProtocolConfig,
  ProtocolCtx,
  SimConfig,
  SimEvent,
  SimNode,
  Tick,
} from "../core/types";

/*
 * Exhibit 1 — Time & ordering (PHASE-2.md §2).
 *
 * Mode A ("wallclock"): each node trusts its own drifting local clock;
 * transactions carry self-claimed timestamps and snapshot placement trusts
 * the claim — so history can be rewritten.
 *
 * Mode B ("quorum"): a snapshot closes once ≥ ⌈2/3·N⌉ distinct nodes have
 * contributed; transactions carry references into the previous snapshot
 * instead of timestamps — so a forgery reveals itself by its references.
 *
 * The rendered view is node 0's log plus global events (one aggregated
 * view; per-node divergent views are a disclosed simplification).
 */

export interface LamportConfig extends ProtocolConfig {
  kind: "lamport";
  mode: "wallclock" | "quorum";
  snapshotTicks: number; // Mode A nominal snapshot length, default 8
  txRate: number; // per-node per-tick tx probability, default 0.15
}

export interface TxRecord {
  txId: string; // `${nodeId}-${counter}` (forged: `forge-…`)
  origin: NodeId;
  claimedTimestamp?: number; // Mode A only
  refs?: string[]; // Mode B only: txIds from the previous snapshot
  snapshot: number; // assignment at acceptance time
  forged: boolean; // adversary flag, drives red styling
  attack?: boolean; // true only for explicit "forge the past" txs
}

type TxPayload = Omit<TxRecord, "snapshot">;

interface LamportNodeState {
  mode: "wallclock" | "quorum";
  driftUnit: number; // stable per-run draw in [-1, 1]; effective offset scales with live clockDrift
  txCounter: number;
  currentSnapshot: number;
  maxSeenSnapshot: number; // highest snapshot this node holds txs in
  seenFrom: NodeId[]; // Mode B: distinct contributors to currentSnapshot
  txLog: TxRecord[];
  [key: string]: unknown;
}

export interface LamportViewModel {
  mode: "wallclock" | "quorum";
  nodeCount: number;
  quorumThreshold: number;
  snapshots: Array<{
    index: number;
    closed: boolean;
    contributors?: number;
    txs: Array<{ txId: string; origin: NodeId; forged: boolean; justMoved: boolean }>;
  }>;
  edges: Array<{ fromTx: string; toTx: string; forged: boolean }>;
  clocks?: Array<{ nodeId: NodeId; offset: number; faulty: boolean }>;
  counters: {
    snapshotsClosed: number;
    attacksAttempted: number;
    attacksSucceeded: number;
    attacksFailed: number;
    avgTxPerSnapshot: number;
  };
}

function lamportCfg(config: SimConfig): LamportConfig {
  return config.protocol as LamportConfig;
}

function st(node: SimNode): LamportNodeState {
  return node.state as unknown as LamportNodeState;
}

function quorumThreshold(nodeCount: number): number {
  return Math.ceil((2 / 3) * nodeCount);
}

function effectiveOffset(state: LamportNodeState, config: SimConfig): number {
  return Math.round(state.driftUnit * config.network.clockDrift);
}

function localTime(state: LamportNodeState, tick: Tick, config: SimConfig): number {
  return Math.max(0, tick + effectiveOffset(state, config));
}

function isLiar(node: SimNode, config: SimConfig): boolean {
  return node.faulty && config.adversary.behavior === "timestamp_liar";
}

/** Accept a tx into this node's log; emits view-relevant events for node 0. */
function accept(node: SimNode, tx: TxRecord, ctx: ProtocolCtx): void {
  const state = st(node);
  state.txLog.push(tx);
  const reordered = tx.snapshot < state.maxSeenSnapshot;
  state.maxSeenSnapshot = Math.max(state.maxSeenSnapshot, tx.snapshot);
  if (node.id === 0) {
    ctx.emit("tx_accepted", { txId: tx.txId, origin: tx.origin, snapshot: tx.snapshot });
  }
  if (reordered) {
    if (tx.attack) {
      ctx.emit("attack_succeeded", { txId: tx.txId, node: node.id, intoSnapshot: tx.snapshot });
    } else {
      ctx.emit("history_reordered", { txId: tx.txId, node: node.id, intoSnapshot: tx.snapshot });
    }
  }
}

/** Mode B: register a contributor and close the snapshot on quorum. */
function contribute(node: SimNode, origin: NodeId, ctx: ProtocolCtx): void {
  const state = st(node);
  if (!state.seenFrom.includes(origin)) state.seenFrom.push(origin);
  const threshold = quorumThreshold(ctx.config.nodeCount);
  if (state.seenFrom.length >= threshold) {
    if (node.id === 0) {
      ctx.emit("snapshot_closed", {
        snapshot: state.currentSnapshot,
        contributors: state.seenFrom.length,
        mode: "quorum",
      });
    }
    state.currentSnapshot += 1;
    state.seenFrom = [node.id];
  }
}

function sampleRefs(state: LamportNodeState, ctx: ProtocolCtx): string[] | null {
  if (state.currentSnapshot === 0) return [];
  const prev = state.txLog.filter((t) => t.snapshot === state.currentSnapshot - 1);
  if (prev.length === 0) return null; // cannot produce valid refs yet
  const want = 2 + ctx.rng.int(3); // 2..4
  const pool = [...prev];
  const refs: string[] = [];
  while (refs.length < Math.min(want, pool.length)) {
    const i = ctx.rng.int(pool.length);
    refs.push((pool[i] as TxRecord).txId);
    pool.splice(i, 1);
  }
  return refs;
}

export const lamportProtocol: Protocol<LamportViewModel> = {
  name: "lamport",

  init(config, rng) {
    const cfg = lamportCfg(config);
    return Array.from({ length: config.nodeCount }, () => {
      const driftUnit = cfg.mode === "wallclock" ? rng.range(-1, 1) : 0;
      const state: LamportNodeState = {
        mode: cfg.mode,
        driftUnit,
        txCounter: 0,
        currentSnapshot: 0,
        maxSeenSnapshot: 0,
        seenFrom: [],
        txLog: [],
      };
      return state as unknown as Record<string, unknown>;
    });
  },

  onTick(node, tick, ctx) {
    const cfg = lamportCfg(ctx.config);
    const state = st(node);

    // Mode A snapshot advance: each node follows its own drifted clock.
    // Nodes disagreeing about boundaries is the lesson — do not "fix" it.
    if (cfg.mode === "wallclock") {
      const snap = Math.floor(localTime(state, tick, ctx.config) / cfg.snapshotTicks);
      if (snap > state.currentSnapshot) {
        if (node.id === 0) {
          for (let k = state.currentSnapshot; k < snap; k++) {
            ctx.emit("snapshot_closed", { snapshot: k, mode: "wallclock" });
          }
        }
        state.currentSnapshot = snap;
      }
    }

    if (!ctx.rng.chance(cfg.txRate)) return;

    if (cfg.mode === "wallclock") {
      let claimed = localTime(state, tick, ctx.config);
      // Passive adversary: claims timestamps from the (recent) past.
      if (isLiar(node, ctx.config)) {
        claimed = Math.max(0, claimed - cfg.snapshotTicks - ctx.rng.int(2 * cfg.snapshotTicks));
      }
      const tx: TxRecord = {
        txId: `${node.id}-${state.txCounter++}`,
        origin: node.id,
        claimedTimestamp: claimed,
        snapshot: Math.floor(claimed / cfg.snapshotTicks),
        forged: isLiar(node, ctx.config),
      };
      accept(node, tx, ctx);
      const payload: TxPayload = {
        txId: tx.txId,
        origin: tx.origin,
        claimedTimestamp: tx.claimedTimestamp,
        forged: tx.forged,
      };
      ctx.send("broadcast", payload as Record<string, unknown>);
    } else {
      const refs = sampleRefs(state, ctx);
      if (refs === null) return;
      const tx: TxRecord = {
        txId: `${node.id}-${state.txCounter++}`,
        origin: node.id,
        refs,
        snapshot: state.currentSnapshot,
        forged: false,
      };
      accept(node, tx, ctx);
      contribute(node, node.id, ctx);
      const payload: TxPayload = { txId: tx.txId, origin: tx.origin, refs, forged: false };
      ctx.send("broadcast", payload as Record<string, unknown>);
    }
  },

  onMessage(node, msg: Message, ctx) {
    const cfg = lamportCfg(ctx.config);
    const state = st(node);
    const payload = msg.payload as unknown as TxPayload;

    if (cfg.mode === "wallclock") {
      // Trust the claim unconditionally — even into the receiver's past.
      const snapshot = Math.floor((payload.claimedTimestamp ?? 0) / cfg.snapshotTicks);
      accept(node, { ...payload, snapshot }, ctx);
      return;
    }

    // Mode B: assign to the receiver's open snapshot; valid iff every ref is
    // a tx this node accepted in the snapshot just before it.
    const s = state.currentSnapshot;
    const refs = payload.refs ?? [];
    const valid =
      s === 0
        ? true
        : refs.length > 0 &&
          refs.every((id) =>
            state.txLog.some((t) => t.txId === id && t.snapshot === s - 1),
          );
    if (!valid) {
      if (payload.attack) {
        ctx.emit("attack_failed", {
          txId: payload.txId,
          node: node.id,
          reason: "stale_refs",
          atSnapshot: s,
        });
      } else if (node.id === 0) {
        ctx.emit("tx_rejected", { txId: payload.txId, reason: "stale_refs" });
      }
      return;
    }
    accept(node, { ...payload, snapshot: s }, ctx);
    contribute(node, payload.origin, ctx);
  },

  /**
   * "Forge the past" (PHASE-2 §2.5): the adversary observes a victim tx in a
   * closed snapshot and tries to create one that precedes it.
   */
  action(name, arg, api) {
    if (name !== "forge") return;
    const cfg = lamportCfg(api.config);
    const adversary = api.nodes.find((n) => n.faulty);
    // Anchor on the first honest node's view — the same view the stage renders.
    const anchor = api.nodes.find((n) => !n.faulty);
    const requested = (arg as { targetSnapshot?: number } | undefined)?.targetSnapshot;
    const target = requested ?? (anchor ? st(anchor).currentSnapshot - 1 : -1);

    api.emit("attack_attempted", { targetSnapshot: target });

    if (!adversary || !anchor || target < 0) {
      api.emit("attack_aborted", {
        reason: adversary ? "nothing_to_forge" : "no_adversary",
      });
      return;
    }

    const victims = st(anchor).txLog.filter((t) => t.snapshot === target && !t.attack);
    const victim = victims[victims.length - 1];
    if (!victim) {
      api.emit("attack_aborted", { reason: "nothing_to_forge" });
      return;
    }

    const adv = st(adversary);
    const txId = `forge-${api.tick}`;

    if (cfg.mode === "wallclock") {
      // Lie: claim a timestamp just before the victim's, inside the closed snapshot.
      const claimed = Math.max(target * cfg.snapshotTicks, (victim.claimedTimestamp ?? 0) - 1);
      const payload: TxPayload = {
        txId,
        origin: adversary.id,
        claimedTimestamp: claimed,
        forged: true,
        attack: true,
      };
      api.emit("forge_broadcast", { txId, victim: victim.txId, targetSnapshot: target });
      api.sendFrom(adversary.id, "broadcast", payload as Record<string, unknown>);
    } else {
      // Best attempt: reference what it actually saw in snapshot target−1.
      // Those refs reveal the tx was created after the target closed.
      const staleRefs = adv.txLog
        .filter((t) => t.snapshot === Math.max(0, target - 1))
        .slice(-3)
        .map((t) => t.txId);
      const payload: TxPayload = {
        txId,
        origin: adversary.id,
        refs: staleRefs,
        forged: true,
        attack: true,
      };
      api.emit("forge_broadcast", { txId, victim: victim.txId, targetSnapshot: target });
      api.sendFrom(adversary.id, "broadcast", payload as Record<string, unknown>);
    }
  },

  snapshotView(nodes, tick, events): LamportViewModel {
    const viewNode = nodes[0] as SimNode;
    const state = st(viewNode);
    const mode = state.mode;
    const threshold = quorumThreshold(nodes.length);

    const closedContributors = new Map<number, number>();
    let snapshotsClosed = 0;
    let attacksAttempted = 0;
    const succeededTx = new Set<string>();
    const failedTx = new Set<string>();
    const recentlyMoved = new Set<string>();
    for (const e of events) {
      if (e.kind === "snapshot_closed") {
        snapshotsClosed += 1;
        const snap = e.data.snapshot as number;
        if (typeof e.data.contributors === "number") {
          closedContributors.set(snap, e.data.contributors);
        }
      } else if (e.kind === "attack_attempted") {
        attacksAttempted += 1;
      } else if (e.kind === "attack_succeeded") {
        succeededTx.add(e.data.txId as string);
        if (e.data.node === 0 && tick - e.tick <= 8) recentlyMoved.add(e.data.txId as string);
      } else if (e.kind === "attack_failed") {
        failedTx.add(e.data.txId as string);
      } else if (e.kind === "history_reordered") {
        if (e.data.node === 0 && tick - e.tick <= 8) recentlyMoved.add(e.data.txId as string);
      }
    }

    const maxIndex = Math.max(state.currentSnapshot, state.maxSeenSnapshot);
    const byId = new Map(state.txLog.map((t) => [t.txId, t]));
    const snapshots: LamportViewModel["snapshots"] = [];
    for (let i = 0; i <= maxIndex; i++) {
      const txs = state.txLog.filter((t) => t.snapshot === i);
      if (mode === "wallclock") {
        txs.sort(
          (a, b) =>
            (a.claimedTimestamp ?? 0) - (b.claimedTimestamp ?? 0) ||
            a.txId.localeCompare(b.txId),
        );
      }
      snapshots.push({
        index: i,
        closed: i < state.currentSnapshot,
        contributors:
          mode === "quorum"
            ? (closedContributors.get(i) ?? (i === state.currentSnapshot ? state.seenFrom.length : undefined))
            : undefined,
        txs: txs.map((t) => ({
          txId: t.txId,
          origin: t.origin,
          forged: t.forged,
          justMoved: recentlyMoved.has(t.txId),
        })),
      });
    }

    const edges: LamportViewModel["edges"] = [];
    for (const t of state.txLog) {
      for (const ref of t.refs ?? []) {
        if (byId.has(ref)) edges.push({ fromTx: t.txId, toTx: ref, forged: t.forged });
      }
    }

    return {
      mode,
      nodeCount: nodes.length,
      quorumThreshold: threshold,
      snapshots,
      edges,
      clocks:
        mode === "wallclock"
          ? nodes.map((n) => ({
              nodeId: n.id,
              offset: st(n).driftUnit, // scaled by live clockDrift in the UI
              faulty: n.faulty,
            }))
          : undefined,
      counters: {
        snapshotsClosed,
        attacksAttempted,
        attacksSucceeded: succeededTx.size,
        attacksFailed: failedTx.size,
        avgTxPerSnapshot:
          snapshotsClosed > 0
            ? Math.round((state.txLog.length / Math.max(1, snapshotsClosed)) * 10) / 10
            : 0,
      },
    };
  },

  invariants(nodes, events): InvariantResult[] {
    const viewNode = nodes[0];
    if (!viewNode) return [];
    const state = st(viewNode);
    if (state.mode !== "quorum") {
      return [
        {
          name: "A: wall-clock ordering",
          ok: true,
          detail: "Mode A makes no ordering guarantee — that is the lesson.",
        },
      ];
    }

    // Q1: no tx enters a snapshot after that snapshot closed (node 0's view).
    const closedAt = new Map<number, Tick>();
    for (const e of events) {
      if (e.kind === "snapshot_closed" && typeof e.data.contributors === "number") {
        closedAt.set(e.data.snapshot as number, e.tick);
      }
    }
    let q1 = true;
    let q1Detail: string | undefined;
    for (const e of events) {
      if (e.kind !== "tx_accepted") continue;
      const snap = e.data.snapshot as number;
      const closedTick = closedAt.get(snap);
      if (closedTick !== undefined && e.tick > closedTick) {
        q1 = false;
        q1Detail = `tx ${String(e.data.txId)} entered snapshot ${snap} at tick ${e.tick}, after it closed at tick ${closedTick}`;
        break;
      }
    }

    // Q2: every closed snapshot had ≥ ⌈2/3·N⌉ contributors.
    const threshold = quorumThreshold(nodes.length);
    let q2 = true;
    let q2Detail: string | undefined;
    for (const [snap, contributors] of new Map(
      events
        .filter((e: SimEvent) => e.kind === "snapshot_closed" && typeof e.data.contributors === "number")
        .map((e) => [e.data.snapshot as number, e.data.contributors as number] as const),
    )) {
      if (contributors < threshold) {
        q2 = false;
        q2Detail = `snapshot ${snap} closed with ${contributors}/${threshold}`;
        break;
      }
    }

    return [
      { name: "Q1: closed snapshots are immutable", ok: q1, detail: q1Detail },
      { name: `Q2: quorum ≥ ${threshold}/${nodes.length}`, ok: q2, detail: q2Detail },
    ];
  },
};

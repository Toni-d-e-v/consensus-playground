/*
 * Core shared types (SPEC §5). The engine is framework-free and fully
 * deterministic: all randomness flows through the injected seeded RNG and
 * all time is logical ticks (SPEC §4 hard rules).
 */

import type { Rng } from "./rng";

export type NodeId = number;
export type Tick = number; // logical time, starts at 0
export type Seed = number;

/** Grows into a discriminated union as protocols land (SPEC §5.1). */
export interface ProtocolConfig {
  kind: string;
}

/** Protocol-specific, serializable per-node state (SPEC §5.2). */
export type ProtocolNodeState = Record<string, unknown>;

/** Protocol-specific, serializable message payload (SPEC §5.2). */
export type ProtocolPayload = Record<string, unknown>;

export interface NetworkConfig {
  baseLatency: Tick; // default 3
  jitter: Tick; // ± ticks, drawn from seeded RNG per message
  lossRate: number; // 0..1
  partitions: NodeId[][] | null;
  clockDrift: Tick; // max per-node skew; only wall-clock-trusting protocols use it
}

export type AdversaryBehavior =
  | "timestamp_liar"
  | "withholder"
  | "double_spender"
  | "censor"
  | "equivocator"
  | "offline";

export interface AdversaryConfig {
  fraction: number; // 0..1, rounded down; selection is seeded
  behavior: AdversaryBehavior;
}

export interface SimConfig {
  seed: Seed;
  nodeCount: number; // 4..64
  adversary: AdversaryConfig;
  network: NetworkConfig;
  protocol: ProtocolConfig;
  maxTicks: number; // safety cap, default 10_000
}

export interface Message {
  id: number; // monotonically increasing
  from: NodeId;
  to: NodeId; // engine expands broadcasts into unicasts
  sentAt: Tick;
  deliverAt: Tick; // computed by network layer at send time
  payload: ProtocolPayload;
}

export interface SimNode {
  id: NodeId;
  faulty: boolean; // controlled by adversary
  state: ProtocolNodeState;
}

export interface SimEvent {
  tick: Tick;
  kind: string; // e.g. "msg_sent", "snapshot_closed", "attack_succeeded", …
  data: Record<string, unknown>; // serializable details
}

export interface InvariantResult {
  name: string;
  ok: boolean;
  detail?: string;
}

/*
 * Live control changes during a run are recorded as timestamped commands
 * and are part of the replay (SPEC §5.4/§5.7). Replay = re-run with the
 * same config + the same command list.
 */
export interface ConfigPatch {
  network?: Partial<NetworkConfig>;
}

export type LiveCommand =
  | { tick: Tick; kind: "config"; patch: ConfigPatch }
  | { tick: Tick; kind: "action"; name: string; arg?: unknown };

/** A LiveCommand before the engine stamps the current tick onto it. */
export type LiveCommandInput =
  | { kind: "config"; patch: ConfigPatch }
  | { kind: "action"; name: string; arg?: unknown };

/** Context handed to a node's onTick/onMessage; send() is bound to that node. */
export interface ProtocolCtx {
  tick: Tick;
  config: SimConfig;
  rng: Rng;
  send(to: NodeId | "broadcast", payload: ProtocolPayload): void;
  emit(kind: string, data?: Record<string, unknown>): void;
}

/** Context for protocol-level actions (e.g. "forge"), not bound to one node. */
export interface ActionApi {
  tick: Tick;
  config: SimConfig;
  rng: Rng;
  nodes: readonly SimNode[];
  sendFrom(from: NodeId, to: NodeId | "broadcast", payload: ProtocolPayload): void;
  emit(kind: string, data?: Record<string, unknown>): void;
}

/**
 * Every protocol implements the same interface so the shell, scrubber, and
 * sharing work identically everywhere (SPEC §5.2).
 */
export interface Protocol<VM = unknown> {
  name: string;
  init(config: SimConfig, rng: Rng): ProtocolNodeState[];
  onTick(node: SimNode, tick: Tick, ctx: ProtocolCtx): void;
  onMessage(node: SimNode, msg: Message, ctx: ProtocolCtx): void;
  /** Optional protocol-level action triggered by the UI via a live command. */
  action?(name: string, arg: unknown, api: ActionApi): void;
  snapshotView(nodes: readonly SimNode[], tick: Tick, events: readonly SimEvent[]): VM;
  invariants(nodes: readonly SimNode[], events: readonly SimEvent[]): InvariantResult[];
}

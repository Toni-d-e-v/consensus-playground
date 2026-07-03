/*
 * Core shared types (SPEC §5.1). Phase 0 defines the shapes only —
 * engine logic (tick loop, RNG, network, adversary) lands in Phase 1.
 */

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
  kind: string; // e.g. "msg_sent", "block_mined", "attack_succeeded", …
  data: Record<string, unknown>; // serializable details
}

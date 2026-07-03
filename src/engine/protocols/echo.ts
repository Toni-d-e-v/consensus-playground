import type {
  InvariantResult,
  Message,
  Protocol,
  ProtocolConfig,
  ProtocolCtx,
  SimConfig,
  SimNode,
} from "../core/types";

/*
 * Dummy echo protocol: exists to exercise the Phase 1 determinism harness
 * (SPEC §11 Phase 1). Nodes randomly broadcast pings; receivers count them.
 * Faulty nodes with behavior "offline" go silent and deaf.
 */

export interface EchoConfig extends ProtocolConfig {
  kind: "echo";
  pingRate: number; // per-node per-tick broadcast probability
}

interface EchoState {
  sent: number;
  received: number;
  [key: string]: unknown;
}

export interface EchoViewModel {
  totalSent: number;
  totalReceived: number;
}

function state(node: SimNode): EchoState {
  return node.state as EchoState;
}

function isOffline(node: SimNode, ctx: ProtocolCtx): boolean {
  return node.faulty && ctx.config.adversary.behavior === "offline";
}

export const echoProtocol: Protocol<EchoViewModel> = {
  name: "echo",

  init(config) {
    return Array.from({ length: config.nodeCount }, () => ({ sent: 0, received: 0 }));
  },

  onTick(node, _tick, ctx) {
    if (isOffline(node, ctx)) return;
    const cfg = ctx.config.protocol as EchoConfig;
    if (ctx.rng.chance(cfg.pingRate)) {
      const s = state(node);
      s.sent += 1;
      ctx.emit("ping_sent", { node: node.id, n: s.sent });
      ctx.send("broadcast", { t: "ping", from: node.id, n: s.sent });
    }
  },

  onMessage(node, _msg: Message, ctx) {
    if (isOffline(node, ctx)) return;
    state(node).received += 1;
  },

  snapshotView(nodes) {
    let totalSent = 0;
    let totalReceived = 0;
    for (const n of nodes) {
      totalSent += state(n).sent;
      totalReceived += state(n).received;
    }
    return { totalSent, totalReceived };
  },

  invariants(nodes): InvariantResult[] {
    const bad = nodes.some((n) => state(n).sent < 0 || state(n).received < 0);
    return [{ name: "counters non-negative", ok: !bad }];
  },
};

export function defaultEchoConfig(seed: number, nodeCount = 9): SimConfig {
  const protocol: EchoConfig = { kind: "echo", pingRate: 0.08 };
  return {
    seed,
    nodeCount,
    adversary: { fraction: 0, behavior: "offline" },
    network: { baseLatency: 3, jitter: 1, lossRate: 0, partitions: null, clockDrift: 0 },
    protocol,
    maxTicks: 10_000,
  };
}

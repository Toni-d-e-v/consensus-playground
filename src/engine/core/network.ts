import type { Rng } from "./rng";
import type { NetworkConfig, NodeId, Tick } from "./types";

/*
 * Message delivery model (SPEC §5.4): latency + seeded jitter, loss,
 * partitions. Delivery is planned once, at send time.
 */

export type DeliveryPlan =
  | { kind: "deliver"; deliverAt: Tick }
  | { kind: "lost" }
  | { kind: "partitioned" };

function canCommunicate(partitions: NodeId[][], a: NodeId, b: NodeId): boolean {
  const groupOf = (n: NodeId): number => partitions.findIndex((g) => g.includes(n));
  const ga = groupOf(a);
  const gb = groupOf(b);
  // Nodes not listed in any group form one implicit group.
  return ga === gb;
}

export function planDelivery(
  from: NodeId,
  to: NodeId,
  tick: Tick,
  net: NetworkConfig,
  rng: Rng,
): DeliveryPlan {
  if (net.partitions && !canCommunicate(net.partitions, from, to)) {
    return { kind: "partitioned" };
  }
  // Draw jitter before the loss roll so RNG consumption per message is uniform.
  const jitter = net.jitter > 0 ? rng.int(2 * net.jitter + 1) - net.jitter : 0;
  if (net.lossRate > 0 && rng.chance(net.lossRate)) {
    return { kind: "lost" };
  }
  // Minimum 1 tick so a message can never be delivered in the tick it was sent.
  return { kind: "deliver", deliverAt: tick + Math.max(1, net.baseLatency + jitter) };
}

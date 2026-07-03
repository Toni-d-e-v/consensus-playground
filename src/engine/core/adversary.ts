import type { Rng } from "./rng";
import type { AdversaryConfig } from "./types";

/*
 * Adversary framework (SPEC §5.5). Faulty-node selection is seeded and
 * uniform across protocols; the behavior logic itself lives in each
 * protocol module (it needs protocol knowledge), keyed off SimNode.faulty
 * and AdversaryConfig.behavior.
 */

/** Returns a per-node faulty flag array; floor(fraction·n) nodes, seeded pick. */
export function assignFaulty(nodeCount: number, adversary: AdversaryConfig, rng: Rng): boolean[] {
  const count = Math.floor(adversary.fraction * nodeCount);
  const ids = Array.from({ length: nodeCount }, (_, i) => i);
  rng.shuffle(ids);
  const faulty = new Array<boolean>(nodeCount).fill(false);
  for (let i = 0; i < count; i++) {
    faulty[ids[i] as number] = true;
  }
  return faulty;
}

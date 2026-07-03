import type { SimConfig } from "../../engine/core/types";
import type { LamportConfig } from "../../engine/protocols/lamport";

/*
 * PHASE-2.md §3.3 — exact preset configs. Presets swap the full SimConfig
 * and reset the run; they are the primary mobile experience.
 * Note: the table says "11% adversary" meaning 1 node of 9; fraction is
 * floored (SPEC §5.5), so we use 0.12 (floor(0.12·9) = 1).
 */

export interface Ex1Preset {
  id: string;
  label: string;
  blurb: string;
  config: SimConfig;
}

function make(
  mode: LamportConfig["mode"],
  drift: number,
  latency: number,
  jitter: number,
  adversaryFraction: number,
): SimConfig {
  const protocol: LamportConfig = { kind: "lamport", mode, snapshotTicks: 8, txRate: 0.15 };
  return {
    seed: 42,
    nodeCount: 9,
    adversary: { fraction: adversaryFraction, behavior: "timestamp_liar" },
    network: {
      baseLatency: latency,
      jitter,
      lossRate: 0,
      partitions: null,
      clockDrift: drift,
    },
    protocol,
    maxTicks: 10_000,
  };
}

export const EX1_PRESETS: Ex1Preset[] = [
  {
    id: "perfect-clocks",
    label: "Perfect clocks",
    blurb: "Drift 0 — even trusting clocks looks fine. That's the setup for the lie.",
    config: make("wallclock", 0, 3, 1, 0),
  },
  {
    id: "real-world",
    label: "Real world",
    blurb: "Drift + jitter — wall-clock ordering quietly rewrites itself, no attacker needed.",
    config: make("wallclock", 6, 4, 3, 0),
  },
  {
    id: "the-heist",
    label: "The heist",
    blurb: "Max drift, adversary armed. One click from a successful forgery.",
    config: make("wallclock", 10, 4, 3, 0.12),
  },
  {
    id: "safety-on",
    label: "Safety on",
    blurb: "Same chaos, but snapshots close by quorum. The forgery bounces.",
    config: make("quorum", 10, 4, 3, 0.12),
  },
];

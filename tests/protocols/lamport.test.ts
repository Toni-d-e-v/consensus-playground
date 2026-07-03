import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/engine/core/simulation";
import { decodeRun, encodeRun } from "../../src/engine/core/sharecodec";
import type { LiveCommand, SimConfig, SimEvent } from "../../src/engine/core/types";
import { lamportProtocol } from "../../src/engine/protocols/lamport";
import { EX1_PRESETS } from "../../src/exhibits/ex1-time/presets";

/*
 * Phase 2 test gate (PHASE-2.md §4).
 */

function preset(id: string, seed?: number): SimConfig {
  const p = EX1_PRESETS.find((p) => p.id === id);
  if (!p) throw new Error(`unknown preset ${id}`);
  const config = structuredClone(p.config);
  if (seed !== undefined) config.seed = seed;
  return config;
}

function simulate(config: SimConfig, commands: LiveCommand[] = [], ticks = 200) {
  const sim = new Simulation(config, lamportProtocol, commands);
  sim.run(ticks);
  return sim;
}

function kinds(events: readonly SimEvent[]): Set<string> {
  return new Set(events.map((e) => e.kind));
}

describe("determinism matrix: 4 presets × 25 seeds, same seed run twice (PHASE-2 §4.1)", () => {
  for (const p of EX1_PRESETS) {
    it(`preset "${p.id}"`, () => {
      for (let s = 1; s <= 25; s++) {
        const config = preset(p.id, s * 104729);
        const a = simulate(config).serializeEvents();
        const b = simulate(config).serializeEvents();
        expect(b, `seed ${config.seed}`).toEqual(a);
      }
    });
  }
});

describe("invariants Q1 + Q2 across 100 seeds (PHASE-2 §4.2)", () => {
  it('hold on "Safety on"', () => {
    for (let s = 1; s <= 100; s++) {
      const sim = simulate(preset("safety-on", s * 7 + 1), [], 400);
      for (const inv of sim.getInvariants()) {
        expect(inv.ok, `seed ${s * 7 + 1}: ${inv.name}: ${inv.detail ?? ""}`).toBe(true);
      }
    }
  });

  it("hold on quorum configs with randomized drift/jitter", () => {
    for (let s = 1; s <= 100; s++) {
      const config = preset("safety-on", s * 13 + 5);
      config.network.clockDrift = s % 12;
      config.network.jitter = s % 6;
      config.network.baseLatency = 2 + (s % 5);
      const sim = simulate(config, [], 400);
      for (const inv of sim.getInvariants()) {
        expect(inv.ok, `seed ${config.seed}: ${inv.name}: ${inv.detail ?? ""}`).toBe(true);
      }
    }
  });
});

describe("invariant A1: Mode A brokenness reproduces (PHASE-2 §4.3)", () => {
  it('"The heist" produces history_reordered within 300 ticks across 100 seeds', () => {
    for (let s = 1; s <= 100; s++) {
      const sim = simulate(preset("the-heist", s * 31 + 3), [], 300);
      const reordered = sim
        .getEvents()
        .some((e) => e.kind === "history_reordered" || e.kind === "attack_succeeded");
      expect(reordered, `seed ${s * 31 + 3}`).toBe(true);
    }
  });
});

describe("attack outcomes (PHASE-2 §4.4)", () => {
  const forgeAt = (tick: number): LiveCommand[] => [{ tick, kind: "action", name: "forge" }];

  it('"The heist": forge succeeds (Mode A)', () => {
    const sim = simulate(preset("the-heist"), forgeAt(120), 250);
    const ks = kinds(sim.getEvents());
    expect(ks.has("attack_attempted")).toBe(true);
    expect(ks.has("attack_succeeded")).toBe(true);
    expect(ks.has("attack_failed")).toBe(false);
    expect(sim.getViewModel().counters.attacksSucceeded).toBe(1);
  });

  it('"Safety on": the same forge fails (Mode B), same seed, no other change', () => {
    const sim = simulate(preset("safety-on"), forgeAt(120), 250);
    const ks = kinds(sim.getEvents());
    expect(ks.has("attack_attempted")).toBe(true);
    expect(ks.has("attack_failed")).toBe(true);
    expect(ks.has("attack_succeeded")).toBe(false);
    expect(sim.getViewModel().counters.attacksFailed).toBe(1);
  });

  it("outcome flip holds across 25 seeds", () => {
    for (let s = 1; s <= 25; s++) {
      const seed = s * 4241 + 17;
      const heist = kinds(simulate(preset("the-heist", seed), forgeAt(120), 250).getEvents());
      const safe = kinds(simulate(preset("safety-on", seed), forgeAt(120), 250).getEvents());
      expect(heist.has("attack_succeeded"), `heist seed ${seed}`).toBe(true);
      expect(heist.has("attack_failed"), `heist seed ${seed}`).toBe(false);
      expect(safe.has("attack_failed"), `safe seed ${seed}`).toBe(true);
      expect(safe.has("attack_succeeded"), `safe seed ${seed}`).toBe(false);
    }
  });
});

describe("share URL replay (PHASE-2 §4.5)", () => {
  it('"The heist" with a live drift change and a forge replays identically', () => {
    const config = preset("the-heist");
    const commands: LiveCommand[] = [
      { tick: 60, kind: "config", patch: { network: { clockDrift: 4 } } },
      { tick: 120, kind: "action", name: "forge" },
    ];
    const original = simulate(config, commands, 250).serializeEvents();

    const { encoded, truncated } = encodeRun(config, commands);
    expect(truncated).toBe(false);
    const decoded = decodeRun(encoded);
    const replayed = simulate(decoded.config, decoded.commands, 250).serializeEvents();
    expect(replayed).toEqual(original);
  });
});

describe("view model sanity", () => {
  it("quorum mode reports contributor meters and closes snapshots at threshold", () => {
    const sim = simulate(preset("safety-on"), [], 300);
    const vm = sim.getViewModel();
    expect(vm.mode).toBe("quorum");
    expect(vm.quorumThreshold).toBe(6); // ceil(2/3 · 9)
    expect(vm.counters.snapshotsClosed).toBeGreaterThan(0);
    const closed = vm.snapshots.filter((s) => s.closed && s.contributors !== undefined);
    expect(closed.length).toBeGreaterThan(0);
    for (const s of closed) expect(s.contributors!).toBeGreaterThanOrEqual(6);
    expect(vm.edges.length).toBeGreaterThan(0);
  });

  it("wallclock mode exposes per-node clocks", () => {
    const vm = simulate(preset("real-world"), [], 100).getViewModel();
    expect(vm.mode).toBe("wallclock");
    expect(vm.clocks?.length).toBe(9);
    expect(vm.clocks!.some((c) => c.offset !== 0)).toBe(true);
  });
});

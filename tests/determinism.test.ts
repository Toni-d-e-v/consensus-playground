import { describe, expect, it } from "vitest";
import { Simulation } from "../src/engine/core/simulation";
import { decodeRun, encodeRun } from "../src/engine/core/sharecodec";
import type { LiveCommand, SimConfig } from "../src/engine/core/types";
import { defaultEchoConfig, echoProtocol, type EchoConfig } from "../src/engine/protocols/echo";

/*
 * Phase 1 gate (SPEC §11): determinism harness on the dummy echo protocol.
 * Same seed + same config (+ same live commands) ⇒ byte-identical event logs.
 */

function runEcho(config: SimConfig, commands: LiveCommand[] = [], ticks = 200): string {
  const sim = new Simulation(config, echoProtocol, commands);
  sim.run(ticks);
  return sim.serializeEvents();
}

describe("engine determinism (echo protocol)", () => {
  it("same seed twice ⇒ identical event logs, across 25 seeds", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const config = defaultEchoConfig(seed * 7919);
      expect(runEcho(config)).toEqual(runEcho(config));
    }
  });

  it("different seeds ⇒ different event logs", () => {
    expect(runEcho(defaultEchoConfig(1))).not.toEqual(runEcho(defaultEchoConfig(2)));
  });

  it("chaos config (jitter, loss, partitions, offline nodes) stays deterministic", () => {
    const config = defaultEchoConfig(1234);
    config.network.jitter = 4;
    config.network.lossRate = 0.2;
    config.network.partitions = [[0, 1, 2, 3], [4, 5, 6, 7, 8]];
    config.adversary.fraction = 0.34;
    expect(runEcho(config)).toEqual(runEcho(config));
    // partitions and loss actually happened
    const events = JSON.parse(runEcho(config)) as Array<{ kind: string }>;
    expect(events.some((e) => e.kind === "msg_partitioned")).toBe(true);
    expect(events.some((e) => e.kind === "msg_lost")).toBe(true);
  });

  it("live commands are part of the replay", () => {
    const config = defaultEchoConfig(42);
    const commands: LiveCommand[] = [
      { tick: 50, kind: "config", patch: { network: { baseLatency: 9, lossRate: 0.3 } } },
      { tick: 120, kind: "config", patch: { network: { partitions: [[0, 1, 2], [3, 4, 5, 6, 7, 8]] } } },
    ];
    const a = runEcho(config, commands);
    const b = runEcho(config, commands);
    expect(a).toEqual(b);
    // and the commands changed the outcome vs a bare run
    expect(a).not.toEqual(runEcho(config));
  });

  it("reset() replays identically without a new Simulation", () => {
    const config = defaultEchoConfig(77);
    const sim = new Simulation(config, echoProtocol);
    sim.run(200);
    const first = sim.serializeEvents();
    sim.reset();
    sim.run(200);
    expect(sim.serializeEvents()).toEqual(first);
  });

  it("step() and run() agree", () => {
    const config = defaultEchoConfig(5);
    const a = new Simulation(config, echoProtocol);
    a.run(150);
    const b = new Simulation(config, echoProtocol);
    for (let i = 0; i < 150; i++) b.step();
    expect(a.serializeEvents()).toEqual(b.serializeEvents());
  });

  it("respects the maxTicks safety cap", () => {
    const config = defaultEchoConfig(9);
    config.maxTicks = 50;
    const sim = new Simulation(config, echoProtocol);
    sim.run(10_000);
    expect(sim.currentTick).toBe(50);
  });
});

describe("share codec (SPEC §5.7)", () => {
  it("encode → decode round-trips config and commands exactly", () => {
    const config = defaultEchoConfig(31337);
    const commands: LiveCommand[] = [
      { tick: 10, kind: "config", patch: { network: { clockDrift: 4 } } },
      { tick: 25, kind: "action", name: "forge", arg: { targetSnapshot: 2 } },
    ];
    const { encoded, truncated } = encodeRun(config, commands);
    expect(truncated).toBe(false);
    expect(/^[A-Za-z0-9_-]+$/.test(encoded)).toBe(true); // URL-safe, no padding
    const decoded = decodeRun(encoded);
    expect(decoded.config).toEqual(config);
    expect(decoded.commands).toEqual(commands);
  });

  it("decoded record replays to an identical event log", () => {
    const config = defaultEchoConfig(2024);
    const commands: LiveCommand[] = [
      { tick: 40, kind: "config", patch: { network: { baseLatency: 7 } } },
    ];
    const original = runEcho(config, commands, 250);
    const { encoded } = encodeRun(config, commands);
    const decoded = decodeRun(encoded);
    expect(runEcho(decoded.config, decoded.commands, 250)).toEqual(original);
  });

  it("caps encoded size by dropping commands, flagged as truncated", () => {
    const config = defaultEchoConfig(1);
    const commands: LiveCommand[] = Array.from({ length: 500 }, (_, i) => ({
      tick: i,
      kind: "config" as const,
      patch: { network: { baseLatency: (i % 9) + 1 } },
    }));
    const { encoded, truncated } = encodeRun(config, commands);
    expect(truncated).toBe(true);
    expect(decodeRun(encoded).commands).toEqual([]);
  });
});

describe("performance budget (SPEC §5.8)", () => {
  it("advanceTick at max-ish config stays trivial (catches O(n²) explosions)", () => {
    const config = defaultEchoConfig(99, 32);
    (config.protocol as EchoConfig).pingRate = 0.2;
    const sim = new Simulation(config, echoProtocol);
    const start = Date.now();
    sim.run(2000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000); // < 1ms/tick average
  });
});

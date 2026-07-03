import { useEffect } from "react";
import { create } from "zustand";
import { Simulation } from "../engine/core/simulation";
import { encodeRun } from "../engine/core/sharecodec";
import type {
  InvariantResult,
  LiveCommand,
  NetworkConfig,
  Protocol,
  SimConfig,
  SimEvent,
} from "../engine/core/types";

/*
 * Bridge between the framework-free engine and React. The Simulation
 * instance lives in a closure (never in React state); the store holds
 * serializable snapshots the UI renders. Wall-clock exists only here,
 * for animation pacing (SPEC §4).
 */

const BASE_TICKS_PER_SECOND = 6;

export interface SimStoreState<VM> {
  presetId: string;
  /** The run's base config (identity of the run; live patches excluded). */
  baseConfig: SimConfig;
  /** Working config incl. applied + optimistic live patches (for control display). */
  config: SimConfig;
  tick: number;
  maxReached: number;
  playing: boolean;
  speed: number;
  viewModel: VM;
  events: readonly SimEvent[];
  invariants: InvariantResult[];
  shareTruncated: boolean;

  applyConfig(config: SimConfig, presetId: string, opts?: { autoplay?: boolean }): void;
  hydrate(config: SimConfig, commands: LiveCommand[], presetId: string): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  stepOnce(): void;
  resetRun(): void;
  scrubTo(tick: number): void;
  advance(steps: number): void;
  liveNetworkPatch(patch: Partial<NetworkConfig>): void;
  invokeAction(name: string, arg?: unknown): void;
  setSpeed(speed: number): void;
  shareUrl(): { url: string; truncated: boolean };
}

export function createSimStore<VM>(
  protocol: Protocol<VM>,
  initialConfig: SimConfig,
  initialPresetId: string,
) {
  let base = structuredClone(initialConfig);
  let sim = new Simulation(base, protocol);

  const useStore = create<SimStoreState<VM>>()((set, get) => {
    const refresh = (): void => {
      set((s) => ({
        tick: sim.currentTick,
        maxReached: Math.max(s.maxReached, sim.currentTick),
        viewModel: sim.getViewModel(),
        events: sim.getEvents().slice(),
        invariants: sim.getInvariants(),
        config: structuredClone(sim.config),
      }));
    };

    const rebuild = (config: SimConfig, commands: LiveCommand[], presetId: string): void => {
      base = structuredClone(config);
      sim = new Simulation(base, protocol, commands);
      set({ presetId, baseConfig: structuredClone(base), maxReached: 0 });
      refresh();
    };

    return {
      presetId: initialPresetId,
      baseConfig: structuredClone(base),
      config: structuredClone(base),
      tick: 0,
      maxReached: 0,
      playing: false,
      speed: 1,
      viewModel: sim.getViewModel(),
      events: [],
      invariants: sim.getInvariants(),
      shareTruncated: false,

      applyConfig(config, presetId, opts) {
        rebuild(config, [], presetId);
        set({ playing: opts?.autoplay ?? true });
      },

      hydrate(config, commands, presetId) {
        rebuild(config, commands, presetId);
        set({ playing: true });
      },

      play: () => set({ playing: true }),
      pause: () => set({ playing: false }),
      togglePlay: () => set((s) => ({ playing: !s.playing })),

      stepOnce() {
        set({ playing: false });
        sim.step();
        refresh();
      },

      resetRun() {
        rebuild(get().baseConfig, [], get().presetId);
        set({ playing: false });
      },

      scrubTo(target) {
        const t = Math.max(0, Math.min(target, get().maxReached));
        set({ playing: false });
        if (t < sim.currentTick) {
          sim = new Simulation(base, protocol, [...sim.getCommands()]);
        }
        sim.run(t);
        refresh();
      },

      advance(steps) {
        if (steps <= 0) return;
        for (let i = 0; i < steps; i++) {
          if (!sim.step()) {
            set({ playing: false });
            break;
          }
        }
        refresh();
      },

      liveNetworkPatch(patch) {
        sim.truncateFutureCommands();
        sim.pushCommand({ kind: "config", patch: { network: patch } });
        // Optimistic display; the engine applies it at the next tick.
        set((s) => {
          const config = structuredClone(s.config);
          Object.assign(config.network, patch);
          return { config };
        });
      },

      invokeAction(name, arg) {
        sim.truncateFutureCommands();
        sim.pushCommand({ kind: "action", name, arg });
        if (!get().playing) {
          sim.step();
          refresh();
        }
      },

      setSpeed: (speed) => set({ speed }),

      shareUrl() {
        const { encoded, truncated } = encodeRun(base, sim.getCommands());
        set({ shareTruncated: truncated });
        const { origin, pathname } = window.location;
        return { url: `${origin}${pathname}#run=${encoded}`, truncated };
      },
    };
  });

  return useStore;
}

/** Drives the simulation from requestAnimationFrame while playing. */
export function useSimDriver<VM>(useStore: ReturnType<typeof createSimStore<VM>>): void {
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | null = null;
    let acc = 0;
    const loop = (now: number): void => {
      if (last !== null) {
        acc += (now - last) / 1000;
        const tps = BASE_TICKS_PER_SECOND * speed;
        const steps = Math.floor(acc * tps);
        if (steps > 0) {
          acc -= steps / tps;
          useStore.getState().advance(steps);
        }
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, useStore]);
}

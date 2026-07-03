import { useEffect, useMemo } from "react";
import { createSimStore, useSimDriver } from "../../app/createSimStore";
import { ChaosControls, ChaosSlider } from "../../components/ChaosControls";
import { ExhibitShell } from "../../components/ExhibitShell";
import { GuidedIntro } from "../../components/GuidedIntro";
import { RunSharing } from "../../components/RunSharing";
import { SimplificationsPanel } from "../../components/SimplificationsPanel";
import { StoryFeed } from "../../components/StoryFeed";
import { TransportBar } from "../../components/TransportBar";
import { decodeRun } from "../../engine/core/sharecodec";
import type { SimConfig } from "../../engine/core/types";
import { lamportProtocol, type LamportConfig } from "../../engine/protocols/lamport";
import { Ex1Stage } from "./Ex1Stage";
import { EX1_PRESETS } from "./presets";
import { deriveMarkers, deriveStory } from "./story";

/*
 * Exhibit 1 — Time & ordering. The whole exhibit is one aha moment:
 * the same forgery succeeds under wall-clock snapshots and bounces off
 * quorum snapshots (PHASE-2.md).
 */

const DEFAULT_PRESET = EX1_PRESETS[2]!; // "The heist" — one click from the lesson
const FORGE_COOLDOWN = 20;

const useEx1Store = createSimStore(
  lamportProtocol,
  DEFAULT_PRESET.config,
  DEFAULT_PRESET.id,
);

const SIMPLIFICATIONS = [
  { text: "No signatures — identity is honest except flagged adversaries." },
  {
    text: "Quorum mode is a teaching hybrid of Lamport logical clocks and round-based DAG certificates.",
    link: {
      label: "Lamport 1978",
      href: "https://lamport.azurewebsites.net/pubs/time-clocks.pdf",
    },
  },
  {
    text: "One aggregated view is rendered; real systems have per-node divergent views.",
    link: { label: "Narwhal & Tusk", href: "https://arxiv.org/abs/2105.11827" },
  },
  { text: "No data-availability or gossip-completeness modeling." },
];

const INTRO_STEPS = [
  { targetId: "ex1-stage", text: "Each column is a snapshot of time. Dots are transactions." },
  { targetId: "ex1-mode-toggle", text: "This toggle changes how a snapshot decides it's finished." },
  { targetId: "ex1-forge", text: "Try to rewrite history." },
];

function protoCfg(config: SimConfig): LamportConfig {
  return config.protocol as LamportConfig;
}

export function Ex1Time() {
  const store = useEx1Store;
  const vm = store((s) => s.viewModel);
  const tick = store((s) => s.tick);
  const maxReached = store((s) => s.maxReached);
  const playing = store((s) => s.playing);
  const speed = store((s) => s.speed);
  const config = store((s) => s.config);
  const baseConfig = store((s) => s.baseConfig);
  const presetId = store((s) => s.presetId);
  const events = store((s) => s.events);
  const invariants = store((s) => s.invariants);

  useSimDriver(store);

  // Share-URL hydration (SPEC §5.7); otherwise autoplay the default preset.
  useEffect(() => {
    const match = window.location.hash.match(/^#run=([A-Za-z0-9_-]+)$/);
    if (match) {
      try {
        const record = decodeRun(match[1]!);
        store.getState().hydrate(record.config, record.commands, "shared");
        return;
      } catch {
        // fall through to a normal start on a malformed hash
      }
    }
    store.getState().play();
  }, [store]);

  const story = useMemo(() => deriveStory(events), [events]);
  const markers = useMemo(() => deriveMarkers(events), [events]);

  const mode = protoCfg(config).mode;
  const adversaryCount = Math.floor(config.adversary.fraction * config.nodeCount);

  const lastAttempt = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]!.kind === "attack_attempted") return events[i]!.tick;
    }
    return -Infinity;
  }, [events]);
  const cooldownLeft = Math.max(0, FORGE_COOLDOWN - (tick - lastAttempt));
  const hasForgeTarget = vm.snapshots.some((s) => s.closed && s.txs.length > 0);
  const forgeDisabled = adversaryCount === 0 || !hasForgeTarget || cooldownLeft > 0;
  const forgeTitle =
    adversaryCount === 0
      ? "Needs an adversary — raise the Adversary slider or load “The heist”."
      : !hasForgeTarget
        ? "Nothing in the past to forge yet — let a snapshot close first."
        : cooldownLeft > 0
          ? `Cooling down (${cooldownLeft} ticks)`
          : "Insert a transaction into an already-closed snapshot";

  const rejectFlashTick = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.kind === "attack_failed" && tick - e.tick <= 6) return e.tick;
      if (e.tick < tick - 6) break;
    }
    return null;
  }, [events, tick]);

  const structural = (mutate: (c: SimConfig) => void): void => {
    const next = structuredClone(baseConfig);
    mutate(next);
    store.getState().applyConfig(next, "custom");
  };

  const setMode = (m: LamportConfig["mode"]): void => {
    if (m === mode) return;
    structural((c) => {
      (c.protocol as LamportConfig).mode = m;
    });
  };

  return (
    <>
      <ExhibitShell
        title="Time & ordering"
        metrics={[
          { label: "Snapshots closed", value: String(vm.counters.snapshotsClosed) },
          {
            label: "Forgeries ok/tried",
            value: `${vm.counters.attacksSucceeded}/${vm.counters.attacksAttempted}`,
          },
          { label: "Avg tx / snapshot", value: vm.counters.avgTxPerSnapshot.toFixed(1) },
        ]}
        headerExtra={<RunSharing getUrl={() => store.getState().shareUrl()} />}
        story={<StoryFeed entries={story} onJump={(t) => store.getState().scrubTo(t)} />}
        sidebar={
          <ChaosControls
            latency={config.network.baseLatency}
            jitter={config.network.jitter}
            lossPct={Math.round(config.network.lossRate * 100)}
            partitionOn={config.network.partitions !== null}
            adversaryPct={Math.round(config.adversary.fraction * 100)}
            adversaryCount={adversaryCount}
            seed={config.seed}
            speed={speed}
            onLatency={(v) => store.getState().liveNetworkPatch({ baseLatency: v })}
            onJitter={(v) => store.getState().liveNetworkPatch({ jitter: v })}
            onLossPct={(v) => store.getState().liveNetworkPatch({ lossRate: v / 100 })}
            onPartition={(on) => {
              const half = Math.ceil(config.nodeCount / 2);
              store.getState().liveNetworkPatch({
                partitions: on
                  ? [
                      Array.from({ length: half }, (_, i) => i),
                      Array.from({ length: config.nodeCount - half }, (_, i) => half + i),
                    ]
                  : null,
              });
            }}
            onAdversaryPct={(v) =>
              structural((c) => {
                c.adversary.fraction = v / 100;
              })
            }
            onSeed={(n) =>
              structural((c) => {
                c.seed = n;
              })
            }
            onReroll={() =>
              structural((c) => {
                c.seed = Math.floor(Math.random() * 1_000_000);
              })
            }
            onSpeed={(s) => store.getState().setSpeed(s)}
          >
            {mode === "wallclock" && (
              <>
                <ChaosSlider
                  label="Clock drift"
                  min={0}
                  max={12}
                  value={config.network.clockDrift}
                  unit=" ticks"
                  onChange={(v) => store.getState().liveNetworkPatch({ clockDrift: v })}
                />
                <ChaosSlider
                  label="Snapshot length"
                  min={4}
                  max={16}
                  value={protoCfg(config).snapshotTicks}
                  unit=" ticks"
                  onChange={(v) =>
                    structural((c) => {
                      (c.protocol as LamportConfig).snapshotTicks = v;
                    })
                  }
                />
              </>
            )}
          </ChaosControls>
        }
        panel={<SimplificationsPanel items={SIMPLIFICATIONS} />}
        transport={
          <TransportBar
            playing={playing}
            tick={tick}
            maxTick={maxReached}
            markers={markers}
            onTogglePlay={() => store.getState().togglePlay()}
            onStep={() => store.getState().stepOnce()}
            onReset={() => store.getState().resetRun()}
            onScrub={(t) => store.getState().scrubTo(t)}
          />
        }
      >
        <div className="flex h-full flex-col">
          {/* Presets + hero controls */}
          <div className="flex flex-wrap items-center gap-2 border-b border-muted px-4 py-2">
            {EX1_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.blurb}
                onClick={() => store.getState().applyConfig(structuredClone(p.config), p.id)}
                className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
                  presetId === p.id
                    ? "border-teal bg-teal/10 text-teal"
                    : "border-muted text-ink/60 hover:border-teal/50 hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}

            <div className="mx-2 h-5 w-px bg-muted" />

            <div
              id="ex1-mode-toggle"
              role="group"
              aria-label="Snapshot boundary mode"
              className="flex overflow-hidden rounded-md border border-muted"
            >
              <button
                type="button"
                aria-pressed={mode === "wallclock"}
                onClick={() => setMode("wallclock")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "wallclock" ? "bg-amber/15 text-amber" : "text-ink/50 hover:text-ink"
                }`}
              >
                Trust clocks
              </button>
              <button
                type="button"
                aria-pressed={mode === "quorum"}
                onClick={() => setMode("quorum")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "quorum" ? "bg-teal/15 text-teal" : "text-ink/50 hover:text-ink"
                }`}
              >
                Trust quorums
              </button>
            </div>

            <button
              id="ex1-forge"
              type="button"
              disabled={forgeDisabled}
              title={forgeTitle}
              onClick={() => store.getState().invokeAction("forge")}
              className="rounded-md border border-signal px-3 py-1.5 text-xs font-medium text-signal transition-colors hover:bg-signal/10 disabled:cursor-not-allowed disabled:border-muted disabled:text-ink/30"
            >
              {cooldownLeft > 0 && cooldownLeft !== Infinity
                ? `Forge the past (${cooldownLeft})`
                : "Forge the past"}
            </button>

            <p className="w-full font-mono text-[10px] text-ink/40 sm:ml-auto sm:w-auto">
              {mode === "wallclock"
                ? "Snapshots close on each node's own drifting clock. Timestamps are taken at their word."
                : `A snapshot closes only once ${vm.quorumThreshold}/${vm.nodeCount} nodes contribute. Claims must reference the past.`}
            </p>
          </div>

          <div id="ex1-stage" className="relative min-h-0 flex-1">
            <Ex1Stage
              vm={vm}
              tick={tick}
              clockDrift={config.network.clockDrift}
              rejectFlashTick={rejectFlashTick}
            />
            {/* Live invariant checks (SPEC §5.2: shown in UI and tested) */}
            <div className="absolute right-3 bottom-2 flex gap-2">
              {invariants.map((inv) => (
                <span
                  key={inv.name}
                  title={inv.detail}
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] ${
                    inv.ok ? "border-teal/40 text-teal/80" : "border-signal text-signal"
                  }`}
                >
                  {inv.ok ? "✓" : "✗"} {inv.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </ExhibitShell>
      <GuidedIntro exhibitId="ex1-time" steps={INTRO_STEPS} />
    </>
  );
}

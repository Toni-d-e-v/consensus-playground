import { useState } from "react";

/*
 * SPEC §6 chaos sidebar. Phase 0: controls render and are interactive
 * locally, but drive nothing — the engine arrives in Phase 1.
 */

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const id = `chaos-${props.label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide text-ink/80">
          {props.label}
        </span>
        <span className="font-mono text-xs text-teal">
          {props.value}
          {props.unit ?? ""}
        </span>
      </span>
      <input
        id={id}
        type="range"
        aria-label={props.label}
        className="w-full"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function ChaosControls() {
  const [latency, setLatency] = useState(3);
  const [jitter, setJitter] = useState(1);
  const [loss, setLoss] = useState(0);
  const [partitioned, setPartitioned] = useState(false);
  const [adversary, setAdversary] = useState(0);
  const [behavior, setBehavior] = useState("timestamp_liar");
  const [seed, setSeed] = useState(42);
  const [speed, setSpeed] = useState("1");

  return (
    <aside
      aria-label="Chaos controls"
      className="flex w-60 shrink-0 flex-col gap-5 overflow-y-auto border-l border-muted bg-panel p-4"
    >
      <h2 className="font-mono text-[10px] tracking-[0.25em] text-ink/50 uppercase">
        Chaos controls
      </h2>

      <Slider label="Latency" min={0} max={20} value={latency} unit=" ticks" onChange={setLatency} />
      <Slider label="Jitter" min={0} max={10} value={jitter} unit=" ticks" onChange={setJitter} />
      <Slider label="Message loss" min={0} max={50} value={loss} unit="%" onChange={setLoss} />

      <label className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-ink/80">Partition</span>
        <button
          type="button"
          role="switch"
          aria-checked={partitioned}
          onClick={() => setPartitioned((p) => !p)}
          className={`relative h-5 w-9 rounded-full border transition-colors ${
            partitioned ? "border-signal bg-signal/30" : "border-muted bg-bg"
          }`}
        >
          <span
            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
              partitioned ? "translate-x-4 bg-signal" : "translate-x-1 bg-ink/40"
            }`}
          />
          <span className="sr-only">Toggle network partition</span>
        </button>
      </label>

      <Slider label="Adversary" min={0} max={49} value={adversary} unit="%" onChange={setAdversary} />

      <label className="block space-y-1.5">
        <span className="text-xs font-medium tracking-wide text-ink/80">
          Adversary behavior
        </span>
        <select
          aria-label="Adversary behavior"
          value={behavior}
          onChange={(e) => setBehavior(e.target.value)}
          className="w-full rounded border border-muted bg-bg px-2 py-1.5 font-mono text-xs text-ink"
        >
          <option value="timestamp_liar">timestamp_liar</option>
          <option value="withholder">withholder</option>
          <option value="offline">offline</option>
        </select>
      </label>

      <div className="space-y-1.5">
        <label htmlFor="chaos-seed" className="text-xs font-medium tracking-wide text-ink/80">
          Seed
        </label>
        <div className="flex gap-2">
          <input
            id="chaos-seed"
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="w-full min-w-0 rounded border border-muted bg-bg px-2 py-1.5 font-mono text-xs text-teal"
          />
          <button
            type="button"
            onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
            className="shrink-0 rounded border border-muted px-2 py-1.5 font-mono text-xs text-ink/70 transition-colors hover:border-teal hover:text-teal"
          >
            Reroll
          </button>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium tracking-wide text-ink/80">Speed</span>
        <select
          aria-label="Simulation speed"
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
          className="w-full rounded border border-muted bg-bg px-2 py-1.5 font-mono text-xs text-ink"
        >
          <option value="0.25">0.25×</option>
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
          <option value="8">8×</option>
        </select>
      </label>

      <p className="mt-auto border-t border-muted pt-3 font-mono text-[10px] leading-relaxed text-ink/35">
        Controls are not wired yet — engine lands in Phase 1.
      </p>
    </aside>
  );
}

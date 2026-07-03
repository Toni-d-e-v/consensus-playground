/*
 * SPEC §6 chaos sidebar, consistent order across exhibits. Fully controlled;
 * exhibits decide which changes are live (recorded commands) vs structural
 * (new run). Controls not meaningful for an exhibit are hidden, never
 * disabled-but-visible — hence the optional behavior select and extras slot.
 */

export function ChaosSlider(props: {
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
        <span className="text-xs font-medium tracking-wide text-ink/80">{props.label}</span>
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

export interface ChaosControlsProps {
  latency: number;
  jitter: number;
  lossPct: number;
  partitionOn: boolean;
  adversaryPct: number;
  adversaryCount: number;
  behavior?: string;
  behaviors?: string[];
  seed: number;
  speed: number;
  onLatency: (v: number) => void;
  onJitter: (v: number) => void;
  onLossPct: (v: number) => void;
  onPartition: (on: boolean) => void;
  onAdversaryPct: (v: number) => void;
  onBehavior?: (b: string) => void;
  onSeed: (n: number) => void;
  onReroll: () => void;
  onSpeed: (s: number) => void;
  /** Exhibit-specific extra controls (e.g. clock drift, snapshot length). */
  children?: React.ReactNode;
}

export function ChaosControls(p: ChaosControlsProps) {
  return (
    <aside
      aria-label="Chaos controls"
      className="flex w-60 shrink-0 flex-col gap-5 overflow-y-auto border-l border-muted bg-panel p-4"
    >
      <h2 className="font-mono text-[10px] tracking-[0.25em] text-ink/50 uppercase">
        Chaos controls
      </h2>

      <ChaosSlider label="Latency" min={1} max={20} value={p.latency} unit=" ticks" onChange={p.onLatency} />
      <ChaosSlider label="Jitter" min={0} max={10} value={p.jitter} unit=" ticks" onChange={p.onJitter} />
      <ChaosSlider label="Message loss" min={0} max={50} value={p.lossPct} unit="%" onChange={p.onLossPct} />

      <label className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-ink/80">Partition</span>
        <button
          type="button"
          role="switch"
          aria-checked={p.partitionOn}
          aria-label="Toggle network partition"
          onClick={() => p.onPartition(!p.partitionOn)}
          className={`relative h-5 w-9 rounded-full border transition-colors ${
            p.partitionOn ? "border-signal bg-signal/30" : "border-muted bg-bg"
          }`}
        >
          <span
            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
              p.partitionOn ? "translate-x-4 bg-signal" : "translate-x-1 bg-ink/40"
            }`}
          />
        </button>
      </label>

      <div className="space-y-1">
        <ChaosSlider label="Adversary" min={0} max={49} value={p.adversaryPct} unit="%" onChange={p.onAdversaryPct} />
        <p className="font-mono text-[10px] text-ink/40">
          = {p.adversaryCount} faulty node{p.adversaryCount === 1 ? "" : "s"}
        </p>
      </div>

      {p.behaviors && p.behaviors.length > 1 && p.onBehavior && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium tracking-wide text-ink/80">Adversary behavior</span>
          <select
            aria-label="Adversary behavior"
            value={p.behavior}
            onChange={(e) => p.onBehavior?.(e.target.value)}
            className="w-full rounded border border-muted bg-bg px-2 py-1.5 font-mono text-xs text-ink"
          >
            {p.behaviors.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      )}

      {p.children}

      <div className="space-y-1.5">
        <label htmlFor="chaos-seed" className="text-xs font-medium tracking-wide text-ink/80">
          Seed
        </label>
        <div className="flex gap-2">
          <input
            id="chaos-seed"
            type="number"
            value={p.seed}
            onChange={(e) => p.onSeed(Number(e.target.value))}
            className="w-full min-w-0 rounded border border-muted bg-bg px-2 py-1.5 font-mono text-xs text-teal"
          />
          <button
            type="button"
            onClick={p.onReroll}
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
          value={String(p.speed)}
          onChange={(e) => p.onSpeed(Number(e.target.value))}
          className="w-full rounded border border-muted bg-bg px-2 py-1.5 font-mono text-xs text-ink"
        >
          {[0.25, 0.5, 1, 2, 4, 8].map((s) => (
            <option key={s} value={String(s)}>
              {s}×
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}

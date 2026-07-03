/*
 * SPEC §6 transport bar. The scrubber is the site's signature element
 * (SPEC §9): an instrument trace with event blips. Scrubbing re-executes
 * the run from tick 0 (replay = re-run, SPEC §5.3).
 */

export interface ScrubberMarker {
  tick: number;
  color: string;
  small?: boolean;
}

function IconButton(props: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-muted text-ink/80 transition-colors hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-teal"
    >
      {props.children}
    </button>
  );
}

export interface TransportBarProps {
  playing: boolean;
  tick: number;
  maxTick: number;
  markers: ScrubberMarker[];
  onTogglePlay: () => void;
  onStep: () => void;
  onReset: () => void;
  onScrub: (tick: number) => void;
}

export function TransportBar(p: TransportBarProps) {
  const max = Math.max(1, p.maxTick);
  const headPct = (Math.min(p.tick, max) / max) * 100;

  return (
    <div
      aria-label="Transport bar"
      className="flex items-center gap-4 border-t border-muted bg-panel px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <IconButton label={p.playing ? "Pause" : "Play"} onClick={p.onTogglePlay}>
          {p.playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
              <rect x="1" y="1" width="4" height="10" />
              <rect x="7" y="1" width="4" height="10" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
              <path d="M2 1l9 5-9 5z" />
            </svg>
          )}
        </IconButton>
        <IconButton label="Step one tick" onClick={p.onStep}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M1 1l7 5-7 5z" />
            <rect x="9" y="1" width="2" height="10" />
          </svg>
        </IconButton>
        <IconButton label="Reset" onClick={p.onReset}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M10.5 6a4.5 4.5 0 1 1-1.3-3.2M10.5 1v2.5H8" />
          </svg>
        </IconButton>
      </div>

      {/* Instrument-trace scrubber with event blips */}
      <div className="relative min-w-0 flex-1">
        <svg className="block h-8 w-full" aria-hidden>
          <line x1="0" y1="16" x2="100%" y2="16" stroke="var(--color-muted)" strokeWidth="1" />
          {p.markers.map((m, i) => (
            <line
              key={i}
              x1={`${(m.tick / max) * 100}%`}
              x2={`${(m.tick / max) * 100}%`}
              y1={m.small ? 12 : 8}
              y2={m.small ? 20 : 24}
              stroke={m.color}
              strokeWidth={m.small ? 1 : 2}
            />
          ))}
          <line x1={`${headPct}%`} x2={`${headPct}%`} y1="4" y2="28" stroke="var(--color-teal)" strokeWidth="1" />
          <circle cx={`${headPct}%`} cy="16" r="4" fill="var(--color-teal)" />
        </svg>
        <input
          type="range"
          min={0}
          max={max}
          value={Math.min(p.tick, max)}
          onChange={(e) => p.onScrub(Number(e.target.value))}
          aria-label="Scrub timeline"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <output
        aria-label="Current tick"
        className="shrink-0 rounded border border-muted bg-bg px-3 py-1.5 font-mono text-sm text-teal tabular-nums"
      >
        TICK {String(p.tick).padStart(4, "0")}
      </output>
    </div>
  );
}

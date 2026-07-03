import { useState } from "react";

/*
 * SPEC §6 transport bar. The scrubber is the site's signature element
 * (SPEC §9): an instrument trace with event blips. Phase 0 renders it
 * non-functional; the engine drives it from Phase 1 on.
 */

function IconButton(props: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="flex h-9 w-9 items-center justify-center rounded border border-muted text-ink/80 transition-colors hover:border-teal hover:text-teal"
    >
      {props.children}
    </button>
  );
}

export function TransportBar() {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      aria-label="Transport bar"
      className="flex items-center gap-4 border-t border-muted bg-panel px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <IconButton label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
          {playing ? (
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
        <IconButton label="Step one tick">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M1 1l7 5-7 5z" />
            <rect x="9" y="1" width="2" height="10" />
          </svg>
        </IconButton>
        <IconButton label="Reset">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M10.5 6a4.5 4.5 0 1 1-1.3-3.2M10.5 1v2.5H8" />
          </svg>
        </IconButton>
      </div>

      {/* Instrument-trace scrubber */}
      <div className="relative flex-1" aria-label="Timeline scrubber">
        <svg className="block h-8 w-full" aria-hidden>
          <line x1="0" y1="16" x2="100%" y2="16" stroke="var(--color-muted)" strokeWidth="1" />
          {/* placeholder scan-line ruler ticks */}
          {Array.from({ length: 41 }, (_, i) => (
            <line
              key={i}
              x1={`${i * 2.5}%`}
              y1={i % 5 === 0 ? 10 : 13}
              x2={`${i * 2.5}%`}
              y2={i % 5 === 0 ? 22 : 19}
              stroke="var(--color-muted)"
              strokeWidth="1"
            />
          ))}
          <circle cx="0" cy="16" r="4" fill="var(--color-teal)" />
        </svg>
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={0}
          disabled
          aria-label="Scrub timeline"
          className="absolute inset-0 h-full w-full cursor-not-allowed opacity-0"
        />
      </div>

      <output
        aria-label="Current tick"
        className="rounded border border-muted bg-bg px-3 py-1.5 font-mono text-sm text-teal tabular-nums"
      >
        TICK 0000
      </output>
    </div>
  );
}

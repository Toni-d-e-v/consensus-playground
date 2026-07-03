import { useState } from "react";
import { Link } from "react-router-dom";
import { ChaosControls } from "./ChaosControls";
import { TransportBar } from "./TransportBar";

/*
 * SPEC §6 shared exhibit shell: story feed (left) · stage (center) ·
 * chaos controls (right) · transport bar (bottom) · metrics strip (top).
 * Phase 0: layout only; every region is a live placeholder.
 */

interface Metric {
  label: string;
  value: string;
}

export function ExhibitShell(props: {
  title: string;
  metrics: Metric[];
  children: React.ReactNode; // the stage
}) {
  const [feedOpen, setFeedOpen] = useState(true);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-muted bg-panel px-4 py-2">
        <Link
          to="/"
          className="font-mono text-xs tracking-widest text-ink/50 uppercase transition-colors hover:text-teal"
        >
          ← Exhibits
        </Link>
        <h1 className="text-sm font-medium">{props.title}</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Story feed */}
        <aside
          aria-label="Story feed"
          className={`flex shrink-0 flex-col border-r border-muted bg-panel transition-[width] ${
            feedOpen ? "w-56" : "w-10"
          }`}
        >
          <button
            type="button"
            onClick={() => setFeedOpen((o) => !o)}
            aria-expanded={feedOpen}
            className="p-3 text-left font-mono text-[10px] tracking-[0.25em] text-ink/50 uppercase transition-colors hover:text-teal"
          >
            {feedOpen ? "Story feed" : "»"}
          </button>
          {feedOpen && (
            <p className="px-3 font-mono text-[10px] leading-relaxed text-ink/35">
              No events yet.
              <br />
              The lab notebook starts writing itself in Phase 1.
            </p>
          )}
        </aside>

        {/* Center column */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            aria-label="Metrics"
            className="grid grid-cols-3 gap-px border-b border-muted bg-muted"
          >
            {props.metrics.map((m) => (
              <div key={m.label} className="bg-panel px-4 py-2">
                <p className="font-mono text-[10px] tracking-widest text-ink/45 uppercase">
                  {m.label}
                </p>
                <p className="font-mono text-lg text-ink tabular-nums">{m.value}</p>
              </div>
            ))}
          </div>

          <section aria-label="Stage" className="min-h-0 flex-1 overflow-hidden">
            {props.children}
          </section>

          <TransportBar />
        </main>

        <ChaosControls />
      </div>
    </div>
  );
}

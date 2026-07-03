import { useState } from "react";
import { Link } from "react-router-dom";

/*
 * SPEC §6 shared exhibit shell: story feed (left) · stage (center) ·
 * chaos controls (right) · transport bar (bottom) · metrics strip (top).
 * Exhibit-specific content arrives through slots.
 */

export interface Metric {
  label: string;
  value: string;
}

export function ExhibitShell(props: {
  title: string;
  metrics: Metric[];
  story: React.ReactNode;
  sidebar: React.ReactNode;
  transport: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** Collapsible "What we simplified" panel content (SPEC §7.6 — mandatory). */
  panel?: React.ReactNode;
  children: React.ReactNode; // the stage
}) {
  // aria-live off by default with a toggle (screen-reader spam guard, SPEC §12)
  const [announce, setAnnounce] = useState(false);

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
        <div className="ml-auto flex items-center gap-3">{props.headerExtra}</div>
      </header>

      <div className="flex min-h-0 flex-1">
        {props.story}

        <main className="flex min-w-0 flex-1 flex-col">
          <div aria-label="Metrics" className="flex items-stretch gap-px border-b border-muted bg-muted">
            {props.metrics.map((m) => (
              <div key={m.label} className="flex-1 bg-panel px-4 py-2">
                <p className="font-mono text-[10px] tracking-widest text-ink/45 uppercase">
                  {m.label}
                </p>
                <p
                  className="font-mono text-lg text-ink tabular-nums"
                  aria-live={announce ? "polite" : "off"}
                >
                  {m.value}
                </p>
              </div>
            ))}
            <div className="flex items-center bg-panel px-3">
              <label className="flex items-center gap-1.5 font-mono text-[10px] text-ink/40">
                <input
                  type="checkbox"
                  checked={announce}
                  onChange={(e) => setAnnounce(e.target.checked)}
                  className="accent-[var(--color-teal)]"
                />
                announce
              </label>
            </div>
          </div>

          <section aria-label="Stage" className="relative min-h-0 flex-1 overflow-hidden">
            {props.children}
          </section>

          {props.panel}
          {props.transport}
        </main>

        {props.sidebar}
      </div>
    </div>
  );
}

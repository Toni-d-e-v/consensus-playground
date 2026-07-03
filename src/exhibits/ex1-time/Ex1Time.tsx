import { ExhibitShell } from "../../components/ExhibitShell";

/*
 * Exhibit 1 — Time & ordering. Phase 0 placeholder: the shell renders
 * with an empty instrument stage; protocol + visuals land in Phase 2.
 */

export function Ex1Time() {
  return (
    <ExhibitShell
      title="Time & ordering"
      metrics={[
        { label: "Snapshots closed", value: "—" },
        { label: "Forgeries", value: "—/—" },
        { label: "Avg tx / snapshot", value: "—" },
      ]}
    >
      <div className="relative h-full w-full">
        <svg className="h-full w-full" aria-hidden>
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="var(--color-muted)"
                strokeWidth="0.5"
                opacity="0.35"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="rounded border border-muted bg-panel px-4 py-3 font-mono text-xs text-ink/50">
            Stage idle — simulation engine arrives in Phase 1.
          </p>
        </div>
      </div>
    </ExhibitShell>
  );
}

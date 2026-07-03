import { useEffect, useRef, useState } from "react";

/*
 * SPEC §6 story feed: human-readable event commentary, auto-scrolling;
 * clicking an entry jumps the scrubber to that tick. Narrates like a lab
 * notebook (SPEC §9).
 */

export interface StoryEntry {
  tick: number;
  text: string;
  tone: "info" | "warn" | "danger" | "ok";
}

const toneClass: Record<StoryEntry["tone"], string> = {
  info: "text-ink/60",
  warn: "text-amber",
  danger: "text-signal",
  ok: "text-teal",
};

export function StoryFeed(props: { entries: StoryEntry[]; onJump: (tick: number) => void }) {
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [props.entries.length]);

  return (
    <aside
      aria-label="Story feed"
      className={`flex shrink-0 flex-col border-r border-muted bg-panel transition-[width] ${
        open ? "w-64" : "w-10"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="shrink-0 p-3 text-left font-mono text-[10px] tracking-[0.25em] text-ink/50 uppercase transition-colors hover:text-teal"
      >
        {open ? "Story feed" : "»"}
      </button>
      {open && (
        <ol
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
        >
          {props.entries.length === 0 && (
            <li className="px-1 font-mono text-[10px] leading-relaxed text-ink/35">
              Nothing yet — press play.
            </li>
          )}
          {props.entries.map((e, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => props.onJump(e.tick)}
                className={`w-full rounded px-1 py-0.5 text-left font-mono text-[10px] leading-relaxed transition-colors hover:bg-bg ${toneClass[e.tone]}`}
              >
                <span className="text-ink/30 tabular-nums">{String(e.tick).padStart(4, "0")}</span>{" "}
                {e.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

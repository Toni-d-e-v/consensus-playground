import { useEffect, useState } from "react";

/*
 * SPEC §6 guided intro: a 3-step coach-mark sequence on first visit.
 * Skippable, never shown again per exhibit (localStorage flag).
 */

export interface IntroStep {
  targetId: string;
  text: string;
}

export function GuidedIntro(props: { exhibitId: string; steps: IntroStep[] }) {
  const storageKey = `cp-intro-${props.exhibitId}`;
  const [step, setStep] = useState<number>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem(storageKey) ? -1 : 0,
  );
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = step >= 0 ? props.steps[step] : undefined;

  useEffect(() => {
    if (!current) return;
    const measure = (): void => {
      const el = document.getElementById(current.targetId);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [current]);

  if (!current) return null;

  const dismiss = (): void => {
    localStorage.setItem(storageKey, "seen");
    setStep(-1);
  };
  const next = (): void => {
    if (step + 1 >= props.steps.length) dismiss();
    else setStep(step + 1);
  };

  const top = rect ? Math.min(window.innerHeight - 140, rect.bottom + 10) : window.innerHeight / 2;
  const left = rect ? Math.max(12, Math.min(window.innerWidth - 320, rect.left)) : 24;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Guided intro">
      <div className="absolute inset-0 bg-bg/60" onClick={dismiss} />
      {rect && (
        <div
          className="pointer-events-none absolute rounded border-2 border-teal"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div
        className="absolute w-[300px] rounded-md border border-teal/50 bg-panel p-4 shadow-xl"
        style={{ top, left }}
      >
        <p className="mb-3 text-sm leading-relaxed text-ink">{current.text}</p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-ink/40">
            {step + 1} / {props.steps.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="rounded px-2 py-1 font-mono text-xs text-ink/50 hover:text-ink"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded border border-teal px-3 py-1 font-mono text-xs text-teal hover:bg-teal/10"
            >
              {step + 1 >= props.steps.length ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

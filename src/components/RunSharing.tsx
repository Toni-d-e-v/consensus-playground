import { useState } from "react";

/*
 * "Share this run" (SPEC §5.7): copies a URL whose hash replays this exact
 * run — config + every live control change and action.
 */

export function RunSharing(props: { getUrl: () => { url: string; truncated: boolean } }) {
  const [state, setState] = useState<"idle" | "copied" | "truncated">("idle");

  const share = async (): Promise<void> => {
    const { url, truncated } = props.getUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this run URL:", url);
    }
    setState(truncated ? "truncated" : "copied");
    window.setTimeout(() => setState("idle"), 2500);
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      title={
        state === "truncated"
          ? "Run too long to encode fully — shared the starting config only."
          : "Copy a URL that replays this exact run"
      }
      className="rounded border border-muted px-2.5 py-1 font-mono text-xs text-ink/70 transition-colors hover:border-teal hover:text-teal"
    >
      {state === "idle" && "Share this run"}
      {state === "copied" && <span className="text-teal">Copied ✓</span>}
      {state === "truncated" && <span className="text-amber">Copied (config only)</span>}
    </button>
  );
}

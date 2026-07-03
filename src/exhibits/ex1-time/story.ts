import type { SimEvent } from "../../engine/core/types";
import type { StoryEntry } from "../../components/StoryFeed";
import type { ScrubberMarker } from "../../components/TransportBar";

/*
 * Derives the human-readable story feed and scrubber blips from the event
 * log — the single source of truth (SPEC §5.6). Lab-notebook voice (§9).
 */

export function deriveStory(events: readonly SimEvent[]): StoryEntry[] {
  const out: StoryEntry[] = [];
  const attackSeen = new Set<string>();
  const victims = new Map<string, string>();

  for (const e of events) {
    switch (e.kind) {
      case "snapshot_closed": {
        const snap = e.data.snapshot as number;
        if (typeof e.data.contributors === "number") {
          out.push({
            tick: e.tick,
            tone: "info",
            text: `Snapshot ${snap} closed — ${e.data.contributors} contributors`,
          });
        } else {
          out.push({ tick: e.tick, tone: "info", text: `Snapshot ${snap} closed by the clock` });
        }
        break;
      }
      case "history_reordered":
        if (e.data.node === 0) {
          out.push({
            tick: e.tick,
            tone: "warn",
            text: `⚠ History reordered — tx ${String(e.data.txId)} slid into snapshot ${String(e.data.intoSnapshot)}`,
          });
        }
        break;
      case "attack_attempted":
        out.push({
          tick: e.tick,
          tone: "danger",
          text: `Adversary attempts to forge the past (target: snapshot ${String(e.data.targetSnapshot)})…`,
        });
        break;
      case "forge_broadcast":
        victims.set(e.data.txId as string, e.data.victim as string);
        break;
      case "attack_succeeded": {
        const txId = e.data.txId as string;
        if (attackSeen.has(txId)) break;
        attackSeen.add(txId);
        const victim = victims.get(txId);
        out.push({
          tick: e.tick,
          tone: "danger",
          text: `⚠ History reordered — ${txId} now “precedes” ${victim ?? "the victim"}`,
        });
        break;
      }
      case "attack_failed": {
        const txId = e.data.txId as string;
        if (attackSeen.has(txId)) break;
        attackSeen.add(txId);
        out.push({
          tick: e.tick,
          tone: "ok",
          text: "✓ Forgery rejected — its references point at a snapshot that already closed",
        });
        break;
      }
      case "attack_aborted":
        out.push({
          tick: e.tick,
          tone: "warn",
          text:
            e.data.reason === "no_adversary"
              ? "Forge aborted — no adversary node in this run"
              : "Forge aborted — nothing in the past to forge yet",
        });
        break;
      case "config_changed": {
        const patch = (e.data.patch ?? {}) as { network?: Record<string, unknown> };
        const parts = Object.entries(patch.network ?? {}).map(
          ([k, v]) => `${k} → ${Array.isArray(v) ? "split" : v === null ? "off" : String(v)}`,
        );
        if (parts.length > 0) {
          out.push({ tick: e.tick, tone: "info", text: `Chaos: ${parts.join(", ")}` });
        }
        break;
      }
    }
  }
  return out.slice(-150);
}

export function deriveMarkers(events: readonly SimEvent[]): ScrubberMarker[] {
  const markers: ScrubberMarker[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.kind === "attack_succeeded" || e.kind === "attack_failed") {
      const key = `${e.kind}:${String(e.data.txId)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({
        tick: e.tick,
        color: e.kind === "attack_succeeded" ? "var(--color-signal)" : "var(--color-teal)",
      });
    } else if (e.kind === "history_reordered" && e.data.node === 0) {
      markers.push({ tick: e.tick, color: "var(--color-amber)", small: true });
    } else if (e.kind === "snapshot_closed") {
      markers.push({ tick: e.tick, color: "var(--color-muted)", small: true });
    }
  }
  return markers.slice(-400);
}

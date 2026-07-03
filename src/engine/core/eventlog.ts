import type { SimEvent, Tick } from "./types";

/**
 * Append-only log of everything that happened (SPEC §5.6). Single source of
 * truth for the timeline scrubber, metrics, story feed, and determinism tests.
 */
export class EventLog {
  private events: SimEvent[] = [];

  append(tick: Tick, kind: string, data: Record<string, unknown> = {}): void {
    this.events.push({ tick, kind, data });
  }

  all(): readonly SimEvent[] {
    return this.events;
  }

  serialize(): string {
    return JSON.stringify(this.events);
  }

  clear(): void {
    this.events = [];
  }
}

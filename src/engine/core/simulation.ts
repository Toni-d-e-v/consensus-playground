import { assignFaulty } from "./adversary";
import { EventLog } from "./eventlog";
import { planDelivery } from "./network";
import { createRng, type Rng } from "./rng";
import type {
  ActionApi,
  ConfigPatch,
  InvariantResult,
  LiveCommand,
  LiveCommandInput,
  Message,
  NodeId,
  Protocol,
  ProtocolCtx,
  ProtocolPayload,
  SimConfig,
  SimEvent,
  SimNode,
  Tick,
} from "./types";

/*
 * Tick loop & determinism (SPEC §5.3).
 *
 * advanceTick order: (0) apply live commands scheduled for this tick,
 * (1) deliver all messages due this tick in ascending Message.id order,
 * (2) call onTick on every node in ascending NodeId order, (3) increment.
 * Iteration order is always explicit and sorted.
 *
 * Live control changes (chaos sliders, protocol actions like "forge") are
 * recorded as timestamped LiveCommands; replay = re-run from tick 0 with the
 * same config + commands (SPEC §5.7). pushCommand only *records* — the
 * command is applied at the start of the next advanceTick, which is exactly
 * where a replay applies it too, so live runs and replays are identical.
 */
export class Simulation<VM = unknown> {
  readonly protocol: Protocol<VM>;
  private readonly initialConfig: SimConfig;
  private commands: LiveCommand[];

  private cfg!: SimConfig; // working copy; live config patches mutate this
  private rng!: Rng;
  private nodes: SimNode[] = [];
  private queue: Message[] = [];
  private log = new EventLog();
  private nextMsgId = 0;
  private tick: Tick = 0;

  constructor(config: SimConfig, protocol: Protocol<VM>, commands: LiveCommand[] = []) {
    this.protocol = protocol;
    this.initialConfig = structuredClone(config);
    this.commands = commands.map((c) => structuredClone(c));
    this.reset();
  }

  /** Back to tick 0. Keeps the recorded commands (they re-apply as ticks pass). */
  reset(): void {
    this.cfg = structuredClone(this.initialConfig);
    this.rng = createRng(this.cfg.seed);
    this.log.clear();
    this.queue = [];
    this.nextMsgId = 0;
    this.tick = 0;
    const faulty = assignFaulty(this.cfg.nodeCount, this.cfg.adversary, this.rng);
    const states = this.protocol.init(this.cfg, this.rng);
    this.nodes = states.map((state, id) => ({ id, faulty: faulty[id] ?? false, state }));
  }

  get currentTick(): Tick {
    return this.tick;
  }

  get config(): SimConfig {
    return this.cfg;
  }

  getCommands(): readonly LiveCommand[] {
    return this.commands;
  }

  getEvents(): readonly SimEvent[] {
    return this.log.all();
  }

  serializeEvents(): string {
    return this.log.serialize();
  }

  getViewModel(): VM {
    return this.protocol.snapshotView(this.nodes, this.tick, this.log.all());
  }

  getInvariants(): InvariantResult[] {
    return this.protocol.invariants(this.nodes, this.log.all());
  }

  getNodes(): readonly SimNode[] {
    return this.nodes;
  }

  /**
   * Record a live control change or protocol action at the current tick.
   * It takes effect at the start of the next step() — identical to replay.
   */
  pushCommand(cmd: LiveCommandInput): LiveCommand {
    const full = { ...structuredClone(cmd), tick: this.tick } as LiveCommand;
    this.commands.push(full);
    return full;
  }

  /** Drop recorded commands scheduled after the current tick (history branch). */
  truncateFutureCommands(): void {
    this.commands = this.commands.filter((c) => c.tick <= this.tick);
  }

  /** Execute one tick. Returns false when the maxTicks safety cap is reached. */
  step(): boolean {
    const t = this.tick;
    if (t >= this.cfg.maxTicks) return false;

    // (0) live commands scheduled for this tick, in recorded order
    for (const cmd of this.commands) {
      if (cmd.tick === t) this.applyCommand(cmd);
    }

    // (1) deliveries due this tick, ascending Message.id
    const due = this.queue.filter((m) => m.deliverAt <= t).sort((a, b) => a.id - b.id);
    if (due.length > 0) {
      this.queue = this.queue.filter((m) => m.deliverAt > t);
      for (const m of due) {
        this.log.append(t, "msg_delivered", { id: m.id, from: m.from, to: m.to });
        const node = this.nodes[m.to];
        if (node) this.protocol.onMessage(node, m, this.ctxFor(node));
      }
    }

    // (2) onTick, ascending NodeId (nodes array is index-ordered)
    for (const node of this.nodes) {
      this.protocol.onTick(node, t, this.ctxFor(node));
    }

    this.tick = t + 1;
    return true;
  }

  /** Run until the given tick (exclusive upper bound is `untilTick`). */
  run(untilTick: Tick): void {
    while (this.tick < untilTick) {
      if (!this.step()) break;
    }
  }

  /** In-flight message count (for the UI's message layer). */
  pendingMessages(): readonly Message[] {
    return this.queue;
  }

  private applyCommand(cmd: LiveCommand): void {
    if (cmd.kind === "config") {
      this.applyPatch(cmd.patch);
      this.log.append(this.tick, "config_changed", { patch: cmd.patch as Record<string, unknown> });
    } else {
      this.log.append(this.tick, "action_invoked", { name: cmd.name });
      this.protocol.action?.(cmd.name, cmd.arg, this.actionApi());
    }
  }

  private applyPatch(patch: ConfigPatch): void {
    if (patch.network) Object.assign(this.cfg.network, structuredClone(patch.network));
  }

  private enqueue(from: NodeId, to: NodeId | "broadcast", payload: ProtocolPayload): void {
    const targets =
      to === "broadcast"
        ? this.nodes.map((n) => n.id).filter((id) => id !== from)
        : [to];
    for (const target of targets) {
      const id = this.nextMsgId++;
      const plan = planDelivery(from, target, this.tick, this.cfg.network, this.rng);
      if (plan.kind === "lost") {
        this.log.append(this.tick, "msg_lost", { id, from, to: target });
        continue;
      }
      if (plan.kind === "partitioned") {
        this.log.append(this.tick, "msg_partitioned", { id, from, to: target });
        continue;
      }
      this.queue.push({ id, from, to: target, sentAt: this.tick, deliverAt: plan.deliverAt, payload });
      this.log.append(this.tick, "msg_sent", { id, from, to: target, deliverAt: plan.deliverAt });
    }
  }

  private ctxFor(node: SimNode): ProtocolCtx {
    return {
      tick: this.tick,
      config: this.cfg,
      rng: this.rng,
      send: (to, payload) => this.enqueue(node.id, to, payload),
      emit: (kind, data = {}) => this.log.append(this.tick, kind, data),
    };
  }

  private actionApi(): ActionApi {
    return {
      tick: this.tick,
      config: this.cfg,
      rng: this.rng,
      nodes: this.nodes,
      sendFrom: (from, to, payload) => this.enqueue(from, to, payload),
      emit: (kind, data = {}) => this.log.append(this.tick, kind, data),
    };
  }
}

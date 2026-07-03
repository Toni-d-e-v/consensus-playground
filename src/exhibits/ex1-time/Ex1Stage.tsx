import type { LamportViewModel } from "../../engine/protocols/lamport";

/*
 * Exhibit 1 stage (PHASE-2 §3.1): snapshot columns (closed solid, open
 * dashed), transaction dots colored per origin node (adversary = signal red
 * + dash ring — color is never the only encoding), reference edges into the
 * previous snapshot (Mode B), and a rail of drifting clock faces (Mode A).
 */

const VIEW_W = 1040;
const VIEW_H = 540;
const COL_W = 100;
const COL_GAP = 10;
const TX_START_Y = 64;
const TX_SPACING = 22;
const VISIBLE = 8;

function originColor(id: number): string {
  return `hsl(${(id * 137.508) % 360} 62% 62%)`;
}

export function Ex1Stage(props: {
  vm: LamportViewModel;
  tick: number;
  clockDrift: number;
  /** Tick of the most recent rejected forgery, if within the flash window. */
  rejectFlashTick: number | null;
}) {
  const { vm } = props;
  const clockRail = vm.mode === "wallclock" ? 92 : 16;
  const start = Math.max(0, vm.snapshots.length - VISIBLE);
  const visible = vm.snapshots.slice(start);
  const maxRows = Math.floor((VIEW_H - TX_START_Y - 20) / TX_SPACING);

  // Positions for every visible tx (edges need both endpoints).
  const pos = new Map<string, { x: number; y: number }>();
  visible.forEach((snap, ci) => {
    const cx = clockRail + ci * (COL_W + COL_GAP) + COL_W / 2;
    snap.txs.slice(0, maxRows).forEach((tx, ri) => {
      pos.set(tx.txId, { x: cx, y: TX_START_Y + ri * TX_SPACING });
    });
  });

  const openCol = visible.findIndex((s) => !s.closed);
  const openColX = openCol >= 0 ? clockRail + openCol * (COL_W + COL_GAP) : null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-full w-full"
      role="img"
      aria-label={`Snapshot lattice, ${vm.snapshots.length} snapshots`}
    >
      {/* Mode A: drifting per-node clock faces along the left edge */}
      {vm.mode === "wallclock" &&
        vm.clocks?.map((c, i) => {
          const offset = Math.round(c.offset * props.clockDrift);
          const cy = 42 + i * 54;
          const angle = (((props.tick + offset) % 24) / 24) * 2 * Math.PI - Math.PI / 2;
          const color = c.faulty ? "var(--color-signal)" : originColor(c.nodeId);
          return (
            <g key={c.nodeId}>
              <circle
                cx={40}
                cy={cy}
                r={14}
                fill="var(--color-panel)"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray={c.faulty ? "3 2" : undefined}
              />
              <line
                x1={40}
                y1={cy}
                x2={40 + Math.cos(angle) * 10}
                y2={cy + Math.sin(angle) * 10}
                stroke={color}
                strokeWidth={1.5}
              />
              <text
                x={62}
                y={cy + 3}
                fontSize={9}
                fill="var(--color-ink)"
                opacity={0.45}
                fontFamily="var(--font-mono)"
              >
                {offset >= 0 ? `+${offset}` : offset}
              </text>
            </g>
          );
        })}

      {/* Reference edges into the previous snapshot */}
      {vm.edges.map((e, i) => {
        const from = pos.get(e.fromTx);
        const to = pos.get(e.toTx);
        if (!from || !to) return null;
        const midX = (from.x + to.x) / 2;
        return (
          <path
            key={i}
            d={`M ${from.x - 8} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x + 8} ${to.y}`}
            fill="none"
            stroke={e.forged ? "var(--color-signal)" : "var(--color-teal)"}
            strokeWidth={1}
            opacity={e.forged ? 0.8 : 0.3}
          />
        );
      })}

      {/* Snapshot columns */}
      {visible.map((snap, ci) => {
        const x = clockRail + ci * (COL_W + COL_GAP);
        const overflow = snap.txs.length - maxRows;
        return (
          <g key={snap.index}>
            <rect
              x={x}
              y={8}
              width={COL_W}
              height={VIEW_H - 16}
              rx={4}
              fill={snap.closed ? "transparent" : "rgba(45, 212, 191, 0.03)"}
              stroke="var(--color-muted)"
              strokeWidth={1}
              strokeDasharray={snap.closed ? undefined : "5 4"}
            />
            <text
              x={x + COL_W / 2}
              y={26}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-ink)"
              opacity={snap.closed ? 0.45 : 0.8}
              fontFamily="var(--font-mono)"
            >
              #{snap.index}
            </text>
            {/* Mode B contributor meter filling toward the ⌈2/3⌉ line */}
            {vm.mode === "quorum" && snap.contributors !== undefined && (
              <g>
                <rect x={x + 10} y={36} width={COL_W - 20} height={4} rx={2} fill="var(--color-muted)" />
                <rect
                  x={x + 10}
                  y={36}
                  width={
                    (COL_W - 20) * Math.min(1, snap.contributors / vm.quorumThreshold)
                  }
                  height={4}
                  rx={2}
                  fill={snap.closed ? "var(--color-amber)" : "var(--color-teal)"}
                />
                <text
                  x={x + COL_W / 2}
                  y={50}
                  textAnchor="middle"
                  fontSize={8}
                  fill="var(--color-ink)"
                  opacity={0.4}
                  fontFamily="var(--font-mono)"
                >
                  {snap.contributors}/{vm.quorumThreshold}
                </text>
              </g>
            )}
            {/* Transactions */}
            {snap.txs.slice(0, maxRows).map((tx) => {
              const p = pos.get(tx.txId);
              if (!p) return null;
              return (
                <g key={tx.txId} className={tx.justMoved ? "tx-flash" : undefined}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={6}
                    fill={tx.forged ? "var(--color-signal)" : originColor(tx.origin)}
                  />
                  {tx.forged && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={9}
                      fill="none"
                      stroke="var(--color-signal)"
                      strokeWidth={1.2}
                      strokeDasharray="3 2"
                    />
                  )}
                </g>
              );
            })}
            {overflow > 0 && (
              <text
                x={x + COL_W / 2}
                y={VIEW_H - 24}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-ink)"
                opacity={0.4}
                fontFamily="var(--font-mono)"
              >
                +{overflow} more
              </text>
            )}
          </g>
        );
      })}

      {/* Rejected forgery: dot bounces off the open column's boundary */}
      {props.rejectFlashTick !== null && openColX !== null && (
        <g key={props.rejectFlashTick} className="forge-bounce">
          <circle
            cx={openColX + COL_W + 18}
            cy={VIEW_H / 2}
            r={7}
            fill="var(--color-signal)"
            opacity={0.9}
          />
          <circle
            cx={openColX + COL_W + 18}
            cy={VIEW_H / 2}
            r={10}
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth={1.2}
            strokeDasharray="3 2"
          />
        </g>
      )}
    </svg>
  );
}

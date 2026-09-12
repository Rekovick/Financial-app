import { useState } from 'react';
import { useSize } from '@/hooks/useSize';
import { ChartEmpty, Tooltip, TooltipRow } from './chartkit';

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
  /** Palette slot 1-8; 0 for the neutral bucket. Drives the arc order. */
  slot: number;
}

/**
 * Category share. A donut rather than a pie so the centre can carry the total —
 * the number people actually want. Segments are separated by a 2px surface gap.
 */
export function DonutChart({
  data,
  total,
  centerLabel,
  centerValue,
  formatValue,
  onSelect,
  height = 210,
}: {
  data: DonutSlice[];
  total: number;
  centerLabel: string;
  centerValue: string;
  formatValue: (v: number) => string;
  onSelect?: (name: string) => void;
  height?: number;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) {
    return (
      <div ref={ref} style={{ height }}>
        <ChartEmpty />
      </div>
    );
  }

  const w = size.width || 320;
  const cx = w / 2;
  const cy = height / 2;
  const outer = Math.min(w, height) / 2 - 6;
  const inner = outer * 0.63;
  const sum = rows.reduce((s, d) => s + d.value, 0) || 1;

  const ordered = orderBySlot(rows);

  // A 2px surface gap between segments, widened to 7px where two neighbours
  // share a hue — at 2px two same-coloured arcs read as one and overstate their
  // size, which is the one thing a share-of-total ring must not do.
  const gapsPx = ordered.map((d, i) => {
    const next = ordered[(i + 1) % ordered.length];
    return ordered.length > 1 && next.color === d.color ? 7 : 2;
  });
  const pads = gapsPx.map((px) => px / outer);
  const usable = Math.max(0.1, Math.PI * 2 - pads.reduce((a, b) => a + b, 0));

  let angle = -Math.PI / 2 + (pads[pads.length - 1] ?? 0) / 2;
  const arcs = ordered.map((d, i) => {
    const sweep = (d.value / sum) * usable;
    const a0 = angle;
    const a1 = a0 + sweep;
    angle = a1 + pads[i];
    return { ...d, i, a0, a1, mid: (a0 + a1) / 2, share: d.value / sum };
  });

  const active = hover ? arcs[hover.i] : null;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      <svg width="100%" height={height} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
        <g>
          {arcs.map((a) => {
            const lift = active?.i === a.i ? 3 : 0;
            return (
              <path
                key={a.name}
                d={arcPath(cx, cy, inner - lift * 0.4, outer + lift, a.a0, a.a1)}
                fill={a.color}
                className="cursor-pointer transition-[d] duration-150"
                onMouseEnter={(e) =>
                  setHover({ i: a.i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })
                }
                onMouseMove={(e) => setHover({ i: a.i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(a.name)}
                stroke="rgb(var(--surface))"
                strokeWidth={2}
              >
                <title>{`${a.name}: ${formatValue(a.value)}`}</title>
              </path>
            );
          })}
        </g>
        <text x={cx} y={cy - 7} textAnchor="middle" className="fill-[rgb(var(--muted))] text-[11px] font-medium uppercase tracking-wider">
          {active ? truncate(active.name, 16) : centerLabel}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-[rgb(var(--ink))] text-[19px] font-semibold">
          {active ? formatValue(active.value) : centerValue}
        </text>
        {active && (
          <text x={cx} y={cy + 33} textAnchor="middle" className="fill-[rgb(var(--muted))] text-[11px]">
            {Math.round(active.share * 100)}% of {formatValue(total)}
          </text>
        )}
      </svg>
      {hover && active && (
        <Tooltip x={hover.x} y={hover.y} width={w}>
          <p className="mb-1 font-semibold text-ink">{active.name}</p>
          <TooltipRow color={active.color} label="Spent" value={formatValue(active.value)} bold />
          <TooltipRow label="Share" value={`${Math.round(active.share * 100)}%`} />
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Categories keep their own colour everywhere in the app, so an arbitrary set
 * of them can end up in one ring — and only some pairs of the palette are safe
 * side by side. The palette is validated as an *adjacent* sequence: every
 * consecutive pair of slots clears the separation gates, while several
 * non-consecutive pairs (orange/yellow, aqua/green, blue/violet in dark) do
 * not. Ordering the arcs by slot therefore guarantees every touching pair is a
 * validated one, with the neutral bucket parked at the end.
 *
 * Arc order carries no meaning here — the ring shows share of a total — so this
 * costs nothing, and the ranked list beside it stays sorted by value.
 */
function orderBySlot<T extends { slot: number; value: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const sa = a.slot || 99;
    const sb = b.slot || 99;
    // Equal slots share a hue; the 2px surface ring keeps their edge visible.
    return sa === sb ? b.value - a.value : sa - sb;
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return [
    `M ${p(r1, a0)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)}`,
    `L ${p(r0, a1)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}`,
    'Z',
  ].join(' ');
}

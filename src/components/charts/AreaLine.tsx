import { useState } from 'react';
import { useSize } from '@/hooks/useSize';
import { AXIS, ChartEmpty, GRID, Tooltip, TooltipRow, niceMax } from './chartkit';

export interface LinePoint {
  key: string;
  label: string;
  value: number;
}

/**
 * A single-series line with a soft fill and a crosshair. One series, so no
 * legend box — the card title names it.
 */
export function AreaLine({
  data,
  color = 'var(--s1)',
  formatValue,
  formatTick,
  height = 190,
  zeroBaseline = true,
  markerLabel,
}: {
  data: LinePoint[];
  color?: string;
  formatValue: (v: number) => string;
  formatTick: (v: number) => string;
  height?: number;
  zeroBaseline?: boolean;
  markerLabel?: string;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const w = size.width || 480;
  const padL = 42;
  const padR = 10;
  const padT = 12;
  const padB = 20;
  const plotW = Math.max(10, w - padL - padR);
  const plotH = Math.max(10, height - padT - padB);

  if (data.length < 2) {
    return (
      <div ref={ref} style={{ height }}>
        <ChartEmpty />
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values, zeroBaseline ? 0 : Infinity);
  const rawMax = Math.max(...values, 0);
  const negative = rawMin < 0;
  const { max, step } = niceMax(Math.max(Math.abs(rawMax), Math.abs(rawMin)));
  const lo = negative ? -max : 0;
  const hi = max;

  const x = (i: number) => padL + (i / (data.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(d.value).toFixed(2)}`).join(' ');
  const zeroY = y(0);
  const areaPath = `${linePath} L ${x(data.length - 1).toFixed(2)} ${zeroY.toFixed(2)} L ${x(0).toFixed(2)} ${zeroY.toFixed(2)} Z`;

  const gradId = `grad-${Math.abs(hashCode(color + data.length))}`;
  const labelEvery = Math.max(1, Math.ceil((data.length * 54) / plotW));
  const hovered = hover != null ? data[hover] : null;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      <svg
        width="100%"
        height={height}
        role="img"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rel = e.nativeEvent.offsetX - padL;
          const i = Math.round((rel / plotW) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={Math.abs(t) < 1e-9 ? AXIS : GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-[rgb(var(--muted))] text-[10px] tnum">
              {formatTick(t)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hovered && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke={AXIS} strokeWidth={1} strokeDasharray="3 3" />
            {/* 2px surface ring keeps the marker readable over the fill. */}
            <circle cx={x(hover)} cy={y(hovered.value)} r={5} fill={color} stroke="rgb(var(--surface))" strokeWidth={2} />
          </g>
        )}

        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.key} x={x(i)} y={height - 5} textAnchor="middle" className="fill-[rgb(var(--muted))] text-[10px]">
              {d.label}
            </text>
          ) : null,
        )}
      </svg>

      {hovered && hover != null && (
        <Tooltip x={x(hover)} y={y(hovered.value)} width={w}>
          <p className="mb-1 font-semibold text-ink">{hovered.label}</p>
          <TooltipRow color={color} label={markerLabel ?? 'Value'} value={formatValue(hovered.value)} bold />
        </Tooltip>
      )}
    </div>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

/** Tiny trend line for stat tiles. No axes, no interaction — it's a texture, not a chart. */
export function Sparkline({
  values,
  color = 'var(--s1)',
  width = 96,
  height = 28,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (width - 2) + 1,
    height - 2 - ((v - min) / span) * (height - 4),
  ]);
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}

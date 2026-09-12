import { useState } from 'react';
import { useSize } from '@/hooks/useSize';
import { AXIS, ChartEmpty, GRID, Legend, Tooltip, TooltipRow, niceMax } from './chartkit';

export interface BarPoint {
  key: string;
  label: string;
  values: number[];
}

/**
 * Grouped bars on a single shared axis — never a dual axis. Bars are thin, sit
 * on the baseline with 4px rounded far-ends, and carry a 2px gap between them.
 */
export function BarSeries({
  data,
  series,
  formatValue,
  formatTick,
  height = 200,
  onSelect,
  highlightKey,
  label,
}: {
  data: BarPoint[];
  series: { label: string; color: string }[];
  formatValue: (v: number) => string;
  formatTick: (v: number) => string;
  height?: number;
  onSelect?: (key: string) => void;
  highlightKey?: string;
  label?: string;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const w = size.width || 480;
  const padL = 40;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const plotW = Math.max(10, w - padL - padR);
  const plotH = Math.max(10, height - padT - padB);

  if (!data.length) {
    return (
      <div ref={ref} style={{ height }}>
        <ChartEmpty />
      </div>
    );
  }

  const peak = Math.max(0.0001, ...data.flatMap((d) => d.values));
  const { max, step } = niceMax(peak);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);

  const slot = plotW / data.length;
  const gap = 2;
  const groupW = Math.min(slot - 8, Math.max(6, slot * 0.66));
  const barW = Math.max(2, (groupW - gap * (series.length - 1)) / series.length);

  const y = (v: number) => padT + plotH - (v / max) * plotH;

  // Label every nth tick so they never collide at narrow widths.
  const labelEvery = Math.max(1, Math.ceil((data.length * 46) / plotW));
  const active = hover ? data[hover.i] : null;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      <svg width="100%" height={height} role="img" aria-label={label ?? series.map((s) => s.label).join(' and ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-[rgb(var(--muted))] text-[10px] tnum">
              {formatTick(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const gx = padL + i * slot + (slot - groupW) / 2;
          const isHot = hover?.i === i || highlightKey === d.key;
          return (
            <g key={d.key}>
              <rect
                x={padL + i * slot}
                y={padT}
                width={slot}
                height={plotH}
                fill={isHot ? 'rgb(var(--ink) / 0.035)' : 'transparent'}
                className="cursor-pointer"
                onMouseEnter={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
                onMouseMove={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(d.key)}
              />
              {d.values.map((v, si) => {
                const h = Math.max(v > 0 ? 1.5 : 0, (v / max) * plotH);
                const x = gx + si * (barW + gap);
                return (
                  <path
                    key={si}
                    d={roundedTopBar(x, padT + plotH - h, barW, h, Math.min(4, barW / 2))}
                    fill={series[si].color}
                    opacity={hover && hover.i !== i ? 0.45 : 1}
                    className="pointer-events-none transition-opacity"
                  />
                );
              })}
              {i % labelEvery === 0 && (
                <text
                  x={padL + i * slot + slot / 2}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-[rgb(var(--muted))] text-[10px]"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover && active && (
        <Tooltip x={hover.x} y={hover.y} width={w}>
          <p className="mb-1 font-semibold text-ink">{active.label}</p>
          {series.map((s, i) => (
            <TooltipRow key={s.label} color={s.color} label={s.label} value={formatValue(active.values[i] ?? 0)} />
          ))}
          {series.length === 2 && (
            <TooltipRow label="Net" value={formatValue((active.values[0] ?? 0) - (active.values[1] ?? 0))} bold />
          )}
        </Tooltip>
      )}

      <Legend items={series} className="mt-1 justify-center" />
    </div>
  );
}

/** Bar anchored to the baseline, rounded only on the data end. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

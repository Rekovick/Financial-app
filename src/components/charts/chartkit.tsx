import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Shared chrome tokens. Grid and axes stay recessive by design. */
export const GRID = 'var(--grid)';
export const AXIS = 'var(--axis)';
export const MUTED = 'rgb(var(--muted))';

/** "Nice" axis maximum so ticks land on round numbers. */
export function niceMax(value: number, ticks = 4): { max: number; step: number } {
  if (!Number.isFinite(value) || value <= 0) return { max: 1, step: 0.25 };
  const rough = value / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(value / step) * step, step };
}

export function ChartFrame({
  children,
  className,
  height,
}: {
  children: ReactNode;
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn('relative w-full', className)} style={height ? { height } : undefined}>
      {children}
    </div>
  );
}

/** Floating tooltip anchored inside the chart box. */
export function Tooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
}) {
  // Flip to the left when there isn't room on the right.
  const flip = x > width - 150;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[132px] max-w-[220px] rounded-lg border border-hairline bg-surface px-2.5 py-2 text-[12px] shadow-pop"
      style={{
        left: flip ? undefined : Math.max(0, x + 12),
        right: flip ? Math.max(0, width - x + 12) : undefined,
        top: Math.max(0, y - 8),
      }}
    >
      {children}
    </div>
  );
}

export function TooltipRow({
  color,
  label,
  value,
  bold,
}: {
  color?: string;
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-px">
      <span className="flex min-w-0 items-center gap-1.5">
        {color && <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />}
        <span className="truncate text-ink-2">{label}</span>
      </span>
      <span className={cn('shrink-0 tnum', bold ? 'font-semibold text-ink' : 'text-ink')}>{value}</span>
    </div>
  );
}

/**
 * Legend. Present whenever there are two or more series — identity is never
 * carried by colour alone.
 */
export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; value?: string }[];
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-[12px]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} aria-hidden />
          <span className="text-ink-2">{it.label}</span>
          {it.value && <span className="tnum font-medium text-ink">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ChartEmpty({ message = 'No data in this range' }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[120px] w-full items-center justify-center text-[13px] text-muted">
      {message}
    </div>
  );
}

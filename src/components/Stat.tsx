import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DeltaPill } from '@/components/ui/Misc';
import { Sparkline } from '@/components/charts/AreaLine';

/**
 * A stat tile is the right form when the answer is one number. It carries the
 * value in ink (never a series colour), an optional comparison, and at most a
 * sparkline for shape.
 */
export function Stat({
  label,
  value,
  sub,
  change,
  goodDirection = 'down',
  trend,
  trendColor,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  change?: number | null;
  goodDirection?: 'up' | 'down';
  trend?: number[];
  trendColor?: string;
  tone?: 'default' | 'in' | 'out';
  className?: string;
}) {
  return (
    <div className={cn('card flex flex-col justify-between gap-2 p-3.5 sm:p-4', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              'redact truncate font-semibold leading-none tracking-tight tnum',
              valueSize(value),
              tone === 'in' && 'text-[rgb(var(--inflow))]',
              tone === 'out' && 'text-ink',
            )}
          >
            {value}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {change !== undefined && <DeltaPill change={change} goodDirection={goodDirection} />}
            {sub && <span className="truncate text-[12px] text-muted">{sub}</span>}
          </div>
        </div>
        {/* Two tiles share a phone row, and the value must never be the thing
            that gets squeezed — so the trend only appears once there's room. */}
        {trend && trend.length > 1 && (
          <div className="redact hidden shrink-0 pb-0.5 sm:block">
            <Sparkline values={trend} color={trendColor ?? 'var(--s1)'} width={64} height={26} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Currency codes and five-figure sums make for long strings. Step the size down
 * rather than clipping — "EGP 23,4…" tells the reader nothing.
 */
function valueSize(value: ReactNode): string {
  const len = typeof value === 'string' ? value.length : 0;
  if (len > 13) return 'text-[17px] sm:text-lg';
  if (len > 9) return 'text-[19px] sm:text-xl';
  return 'text-[22px] sm:text-2xl';
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-2.5 flex items-baseline justify-between gap-3 px-0.5', className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

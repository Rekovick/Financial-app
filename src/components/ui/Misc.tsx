import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { slotColor } from '@/lib/defaults';

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'accent';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-hairline text-ink-2',
    good: 'bg-good/12 text-good',
    warning: 'bg-warning/18 text-[#8a5d00] dark:text-warning',
    critical: 'bg-critical/12 text-critical',
    accent: 'bg-accent-soft text-accent',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, slot = 1, size = 28 }: { name: string; slot?: number; size?: number }) {
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: slotColor(slot),
        fontSize: Math.round(size * 0.38),
      }}
    >
      {initials(name)}
    </span>
  );
}

export function ProgressBar({
  ratio,
  color,
  height = 8,
  track,
  /** Where we're forecast to land, drawn as a tick on the track. */
  markerRatio,
  label,
}: {
  ratio: number;
  color: string;
  height?: number;
  track?: string;
  markerRatio?: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const over = ratio > 1;
  return (
    <div
      className="relative w-full overflow-hidden rounded-full"
      style={{ height, background: track ?? 'rgb(var(--hairline))' }}
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: over ? 'rgb(var(--critical))' : color }}
      />
      {markerRatio != null && markerRatio > 0 && markerRatio < 1.4 && (
        <span
          className="absolute top-0 h-full w-0.5 bg-ink/45"
          style={{ left: `calc(${Math.min(100, markerRatio * 100)}% - 1px)` }}
          title="Projected"
        />
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-hairline text-muted">{icon}</div>
      )}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skel', className)} />;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-hairline', className)} />;
}

/** Small "+12% vs last month" indicator. Never colour alone — it carries an arrow and words. */
export function DeltaPill({
  change,
  /** For spending, up is bad. For income, up is good. */
  goodDirection = 'down',
  suffix,
}: {
  change: number | null;
  goodDirection?: 'up' | 'down';
  suffix?: string;
}) {
  if (change == null || !Number.isFinite(change)) {
    return <span className="text-[12px] text-muted">no prior period</span>;
  }
  const up = change > 0.0005;
  const down = change < -0.0005;
  const flat = !up && !down;
  const good = flat ? null : (up && goodDirection === 'up') || (down && goodDirection === 'down');
  const pct = Math.abs(change);
  const text = pct >= 10 ? '>1000%' : `${Math.round(pct * 100)}%`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-medium tnum',
        flat ? 'text-muted' : good ? 'text-good' : 'text-critical',
      )}
    >
      <span aria-hidden>{flat ? '→' : up ? '↑' : '↓'}</span>
      {flat ? 'flat' : text}
      {suffix && <span className="font-normal text-muted">{suffix}</span>}
    </span>
  );
}

import { cn } from '@/lib/cn';

export interface RowBarItem {
  key: string;
  label: string;
  value: number;
  color: string;
  meta?: string;
}

/**
 * Horizontal ranked bars. Chosen over a pie whenever the job is "compare
 * magnitudes", and it direct-labels every row — which is also the relief the
 * light-mode contrast warning requires.
 */
export function RowBars({
  items,
  formatValue,
  onSelect,
  max: maxOverride,
  compact,
}: {
  items: RowBarItem[];
  formatValue: (v: number) => string;
  onSelect?: (key: string) => void;
  max?: number;
  compact?: boolean;
}) {
  const max = maxOverride ?? Math.max(0.0001, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.key}>
          <button
            type="button"
            onClick={() => onSelect?.(it.key)}
            disabled={!onSelect}
            className={cn(
              'group w-full text-left',
              onSelect && 'cursor-pointer rounded-lg -mx-1.5 px-1.5 py-0.5 transition-colors hover:bg-hairline/70',
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn('min-w-0 truncate text-ink', compact ? 'text-[13px]' : 'text-[13.5px]')}>
                {it.label}
              </span>
              <span className="shrink-0 text-[13px] font-semibold tnum text-ink">{formatValue(it.value)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(1.5, (it.value / max) * 100)}%`, background: it.color }}
                />
              </div>
              {it.meta && <span className="shrink-0 text-[11px] tnum text-muted">{it.meta}</span>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

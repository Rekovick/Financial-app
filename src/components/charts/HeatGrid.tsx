import { addDays, daysBetween, formatDate, fromISO, startOfWeek, todayISO } from '@/lib/dates';

/**
 * Calendar heat map of daily spend. Sequential encoding — one hue, light→dark —
 * so magnitude reads without a legend of hues to memorise. Each cell carries its
 * own accessible label and native tooltip rather than a floating panel.
 */
export function HeatGrid({
  from,
  to,
  valueByDate,
  formatValue,
  weekStart = 1,
  locale = 'en-US',
  onSelect,
}: {
  from: string;
  to: string;
  valueByDate: Map<string, number>;
  formatValue: (v: number) => string;
  weekStart?: 0 | 1 | 6;
  locale?: string;
  onSelect?: (date: string) => void;
}) {
  const today = todayISO();
  const MAX_WEEKS = 53;
  // A daily grid only reads at month-to-year scale. For a longer window, show
  // the most recent year of it rather than thousands of unreadable cells.
  const fullStart = startOfWeek(from, weekStart);
  const spanWeeks = Math.max(1, Math.ceil((daysBetween(fullStart, to) + 1) / 7));
  const weeks = Math.min(MAX_WEEKS, spanWeeks);
  const gridStart = weeks < spanWeeks ? startOfWeek(addDays(to, -(weeks * 7 - 1)), weekStart) : fullStart;
  const truncated = weeks < spanWeeks;
  const max = Math.max(0.0001, ...valueByDate.values());
  const cell = 13;

  // Blue ramp, steps 100→600 from the sequential scale.
  const STEPS = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
  const shade = (v: number): string => {
    if (!v) return 'rgb(var(--hairline))';
    // sqrt so two huge days don't flatten everything else to the palest step.
    const t = Math.min(0.999, Math.sqrt(v / max));
    return STEPS[Math.floor(t * STEPS.length)];
  };

  const dayNames = Array.from({ length: 7 }, (_, i) => {
    const d = fromISO(gridStart);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString(locale, { weekday: 'narrow' });
  });

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex shrink-0 flex-col gap-[3px] pt-0.5">
          {dayNames.map((n, i) => (
            <span key={i} className="flex items-center text-[9px] leading-none text-muted" style={{ height: cell }}>
              {i % 2 === 1 ? n : ''}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {Array.from({ length: weeks }, (_, w) => (
            <div key={w} className="flex flex-col gap-[3px]">
              {Array.from({ length: 7 }, (_, d) => {
                const date = addDays(gridStart, w * 7 + d);
                const inWindow = date >= from && date <= to && date <= today && date >= gridStart;
                const v = valueByDate.get(date) ?? 0;
                const label = `${formatDate(date, locale)} · ${formatValue(v)}`;
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!inWindow}
                    aria-label={inWindow ? label : undefined}
                    title={inWindow ? label : undefined}
                    onClick={() => inWindow && onSelect?.(date)}
                    className="rounded-[3px] transition-transform hover:scale-110 disabled:cursor-default"
                    style={{
                      width: cell,
                      height: cell,
                      background: inWindow ? shade(v) : 'transparent',
                      opacity: inWindow ? 1 : 0.25,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-muted">
        <span>{truncated ? `Showing the last ${weeks} weeks` : ''}</span>
        <span className="flex items-center gap-1.5">
        <span>Less</span>
        {['rgb(var(--hairline))', ...STEPS].map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
        ))}
        <span>More</span>
        </span>
      </div>
    </div>
  );
}

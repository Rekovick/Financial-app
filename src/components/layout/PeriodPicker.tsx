import { useMemo } from 'react';
import { Calendar, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { Button } from '@/components/ui/Button';
import { useUI } from '@/lib/ui';
import { useStore } from '@/lib/store';
import { earliestDate, presetRanges } from '@/lib/analytics';
import { periodLabel, todayISO } from '@/lib/dates';
import { cn } from '@/lib/cn';

export function PeriodPicker({ compact }: { compact?: boolean }) {
  const settings = useStore((s) => s.config.settings);
  const transactions = useStore((s) => s.transactions);
  const { range, rangePreset, setRange, stepPeriod, resetPeriod } = useUI();
  const presets = useMemo(
    () => presetRanges(settings.monthStartDay, earliestDate(transactions)),
    [settings.monthStartDay, transactions],
  );
  const active = presets.find((p) => p.id === rangePreset);

  const label =
    active?.id === 'all'
      ? 'All time'
      : active && active.id !== 'this' && active.id !== 'last'
        ? active.label
        : periodLabel(range, settings.locale, settings.monthStartDay);

  // Stepping only makes sense for month-shaped windows.
  const steppable = rangePreset === 'this' || rangePreset === 'last' || rangePreset === 'custom';
  const atCurrent = range.to >= todayISO();

  return (
    <div className="flex items-center gap-0.5">
      {steppable && (
        <button
          type="button"
          aria-label="Previous period"
          onClick={() => stepPeriod(-1, settings.monthStartDay)}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hairline hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <Popover
        width={250}
        align="start"
        trigger={({ toggle, ref, open }) => (
          <button
            type="button"
            ref={ref as never}
            onClick={toggle}
            aria-expanded={open}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold tracking-tight transition-colors hover:bg-hairline',
              compact ? 'text-[15px]' : 'text-base',
            )}
          >
            <Calendar className="h-3.5 w-3.5 text-muted" />
            <span className="max-w-[46vw] truncate sm:max-w-none">{label}</span>
          </button>
        )}
      >
        {(close) => (
          <div className="py-1">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setRange(p.range, p.id);
                  close();
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-hairline"
              >
                <span>{p.label}</span>
                {rangePreset === p.id && <Check className="h-4 w-4 font-bold text-accent" strokeWidth={3} />}
              </button>
            ))}
            <div className="mt-1 border-t border-hairline px-3 pb-2 pt-2.5">
              <p className="label">Custom range</p>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={range.from}
                  max={range.to}
                  onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })}
                  className="field px-2 py-1.5 text-[13px]"
                />
                <span className="text-muted">–</span>
                <input
                  type="date"
                  value={range.to}
                  min={range.from}
                  onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })}
                  className="field px-2 py-1.5 text-[13px]"
                />
              </div>
            </div>
          </div>
        )}
      </Popover>

      {steppable && (
        <button
          type="button"
          aria-label="Next period"
          disabled={atCurrent}
          onClick={() => stepPeriod(1, settings.monthStartDay)}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hairline hover:text-ink disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {!atCurrent && (
        <Button size="sm" variant="ghost" onClick={() => resetPeriod(settings.monthStartDay)}>
          Today
        </Button>
      )}
    </div>
  );
}

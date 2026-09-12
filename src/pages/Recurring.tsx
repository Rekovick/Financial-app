import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Repeat } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Misc';
import { Segmented } from '@/components/ui/Field';
import { Stat } from '@/components/Stat';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { detectRecurring, monthlyEquivalent, type RecurringRow } from '@/lib/analytics';
import { addDays, daysBetween, formatDate, todayISO } from '@/lib/dates';
import { money, pluralize } from '@/lib/format';
import { categoryColor } from '@/lib/defaults';
import { cn } from '@/lib/cn';

type SortMode = 'cost' | 'next' | 'name';

export function Recurring() {
  const { transactions, config } = useStore();
  const { setFilter, clearFilter } = useUI();
  const navigate = useNavigate();
  const s = config.settings;
  const [sortMode, setSortMode] = useState<SortMode>('cost');

  const rows = useMemo(() => detectRecurring(transactions), [transactions]);

  const order = useMemo(() => {
    const by = (list: RecurringRow[]) => {
      const copy = [...list];
      if (sortMode === 'next') copy.sort((a, b) => a.nextExpected.localeCompare(b.nextExpected));
      else if (sortMode === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
      else copy.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));
      return copy;
    };
    // A £15 subscription and a weekly grocery run are both "recurring", but only
    // one of them is a commitment you could cancel. Splitting them is the whole
    // point of the page.
    return [
      { id: 'fixed', title: 'Bills & subscriptions', hint: 'Same amount every time — the ones you could cancel', items: by(rows.filter((r) => !r.amountVaries)) },
      { id: 'variable', title: 'Regular habits', hint: 'A steady rhythm, but the amount moves', items: by(rows.filter((r) => r.amountVaries)) },
    ].filter((g) => g.items.length);
  }, [rows, sortMode]);

  const fixed = rows.filter((r) => !r.amountVaries);
  const monthlyFixed = fixed.reduce((sum, r) => sum + monthlyEquivalent(r), 0);
  const monthlyTotal = rows.reduce((sum, r) => sum + monthlyEquivalent(r), 0);
  const next30 = rows.filter((r) => r.nextExpected >= todayISO() && r.nextExpected <= addDays(todayISO(), 30));
  const next30Total = next30.reduce((sum, r) => sum + r.average, 0);

  // A charge that hasn't landed well past its due date is worth flagging.
  const overdue = rows.filter((r) => r.nextExpected < addDays(todayISO(), -Math.max(3, r.cadenceDays * 0.25)));

  const open = (row: RecurringRow) => {
    clearFilter();
    setFilter({ search: row.name });
    navigate('/transactions');
  };

  if (!rows.length) {
    return (
      <Card>
        <EmptyState
          icon={<Repeat className="h-5 w-5" />}
          title="No recurring charges found yet"
          body="A merchant needs at least three charges on a steady rhythm before it shows up here. Once your sheet has a few months of history, subscriptions and bills appear automatically."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Fixed bills"
          value={money(monthlyFixed, s, { compact: true })}
          sub={`${pluralize(fixed.length, 'commitment')} a month`}
        />
        <Stat
          label="All recurring"
          value={money(monthlyTotal, s, { compact: true })}
          sub="per month, habits included"
        />
        <Stat label="Due in 30 days" value={money(next30Total, s, { compact: true })} sub={pluralize(next30.length, 'charge')} />
        <Stat label="Fixed per year" value={money(monthlyFixed * 12, s, { compact: true })} sub="if nothing changes" />
      </div>

      {overdue.length > 0 && (
        <Card className="border-warning/30 bg-warning/[0.06]">
          <CardBody className="flex items-start gap-3 py-3.5">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 text-[13px] leading-relaxed">
              <p className="font-semibold">{pluralize(overdue.length, 'charge')} later than expected</p>
              <p className="text-muted">
                {overdue.slice(0, 4).map((r) => r.name).join(', ')}
                {overdue.length > 4 && ` and ${overdue.length - 4} more`}. Either the sheet hasn't caught up, or the
                subscription ended.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Recurring charges"
          subtitle="Detected from your history — nothing here was entered by hand"
          action={
            <Segmented
              size="sm"
              value={sortMode}
              onChange={setSortMode}
              options={[
                { value: 'cost', label: 'Cost' },
                { value: 'next', label: 'Next due' },
                { value: 'name', label: 'A–Z' },
              ]}
            />
          }
        />
        <CardBody className="px-0 pt-2 sm:px-0">
          {order.map((group) => (
            <section key={group.id}>
              <header className="border-y border-hairline bg-raised px-4 py-1.5 sm:px-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{group.title}</h3>
                <p className="text-[11.5px] text-muted">{group.hint}</p>
              </header>
              <ul className="divide-y divide-hairline">
                {group.items.map((r) => {
                  const days = daysBetween(todayISO(), r.nextExpected);
                  return (
                    <li key={r.key}>
                      <button
                        type="button"
                        onClick={() => open(r)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-raised sm:px-5"
                      >
                        <span
                          className="h-8 w-1 shrink-0 rounded-full"
                          style={{ background: categoryColor(config.categories, r.category) }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[14px] font-medium">{r.name}</span>
                            {r.confidence < 0.62 && <Badge tone="neutral">unsure</Badge>}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-muted">
                            {r.cadence === 'irregular' ? `about every ${Math.round(r.cadenceDays)} days` : r.cadence} ·{' '}
                            {r.category} · {r.count}× so far
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="redact block text-[14px] font-semibold tnum">
                            {r.amountVaries ? '≈' : ''}
                            {money(r.average, s)}
                          </span>
                          <span
                            className={cn(
                              'block text-[11.5px] tnum',
                              days < 0 ? 'text-warning' : days <= 3 ? 'text-ink-2' : 'text-muted',
                            )}
                          >
                            {days < 0
                              ? `${Math.abs(days)}d late`
                              : days === 0
                                ? 'due today'
                                : `in ${days}d · ${formatDate(r.nextExpected, s.locale, 'short')}`}
                          </span>
                        </span>
                      </button>
                        </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </CardBody>
      </Card>

      <p className="px-1 text-[12px] leading-relaxed text-muted">
        Monthly figures normalise every cadence, so a yearly renewal counts as one twelfth and a weekly one as 4.3.
        Amounts marked ≈ move between charges.
      </p>
    </div>
  );
}

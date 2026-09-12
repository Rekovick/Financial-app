import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Misc';
import { DonutChart } from '@/components/charts/DonutChart';
import { BarSeries } from '@/components/charts/BarSeries';
import { AreaLine } from '@/components/charts/AreaLine';
import { RowBars } from '@/components/charts/RowBars';
import { HeatGrid } from '@/components/charts/HeatGrid';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import {
  autoBucket,
  byCategory,
  byMerchant,
  byWeekday,
  countable,
  timeSeries,
  totals,
} from '@/lib/analytics';
import { addMonths, formatDate, inRange, periodLabel, todayISO } from '@/lib/dates';
import { compactNumber, money } from '@/lib/format';
import { categoryColor } from '@/lib/defaults';
import type { Bucket } from '@/lib/analytics';

export function Insights() {
  const { transactions, config } = useStore();
  const { range, setFilter, clearFilter } = useUI();
  const navigate = useNavigate();
  const s = config.settings;
  const [bucket, setBucket] = useState<Bucket | 'auto'>('auto');
  const [direction, setDirection] = useState<'expense' | 'income'>('expense');

  const fmt = (v: number) => money(v, s, { compact: true });
  const fmtTick = (v: number) => compactNumber(v, s.locale);

  const effectiveBucket = bucket === 'auto' ? autoBucket(range) : bucket;
  const series = useMemo(() => timeSeries(transactions, range, effectiveBucket, s), [transactions, range, effectiveBucket, s]);
  const sums = useMemo(() => totals(transactions, range), [transactions, range]);

  const cats = useMemo(
    () => byCategory(transactions, config.categories, range, { limit: 8, direction }),
    [transactions, config.categories, range, direction],
  );

  const merchants = useMemo(() => byMerchant(transactions, range).slice(0, 10), [transactions, range]);
  const weekdays = useMemo(() => byWeekday(transactions, range), [transactions, range]);

  // Twelve-month trend always looks back from today, independent of the period.
  const yearRange = useMemo(() => ({ from: `${addMonths(todayISO(), -11).slice(0, 7)}-01`, to: todayISO() }), []);
  const yearly = useMemo(() => timeSeries(transactions, yearRange, 'month', s), [transactions, yearRange, s]);

  const dailySpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (!countable(t) || t.type !== 'expense' || !inRange(t.date, range)) continue;
      map.set(t.date, (map.get(t.date) ?? 0) + t.amount);
    }
    return map;
  }, [transactions, range]);

  const weekdayNames = useMemo(() => {
    const base = new Date(2024, 0, 7); // a Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(s.locale, { weekday: 'long' });
    });
  }, [s.locale]);

  const drillTo = (patch: Parameters<typeof setFilter>[0]) => {
    clearFilter();
    setFilter({ range, ...patch });
    navigate('/transactions');
  };

  // "Other" is a label byCategory invents for the folded tail, so drill through
  // to the categories it actually stands for rather than to a name nothing has.
  const drillToSlice = (name: string) => {
    const slice = cats.find((c) => c.name === name);
    drillTo({ categories: slice?.members ?? [name] });
  };

  if (!transactions.length) {
    return (
      <Card>
        <EmptyState title="Nothing to analyse yet" body="Connect your Google Sheet or add a few transactions first." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Income vs spending"
          subtitle={periodLabel(range, s.locale, s.monthStartDay)}
          action={
            <Segmented
              size="sm"
              value={bucket}
              onChange={setBucket}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          }
        />
        <CardBody className="redact pt-2">
          <BarSeries
            data={series.map((p) => ({ key: p.key, label: p.label, values: [p.income, p.expense] }))}
            series={[
              { label: 'Income', color: 'var(--s6)' },
              { label: 'Spending', color: 'var(--s2)' },
            ]}
            formatValue={(v) => money(v, s)}
            formatTick={fmtTick}
            height={230}
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title={direction === 'expense' ? 'Spending by category' : 'Income by source'}
            action={
              <Segmented
                size="sm"
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'expense', label: 'Out' },
                  { value: 'income', label: 'In' },
                ]}
              />
            }
          />
          <CardBody className="redact pt-1">
            <DonutChart
              data={cats}
              total={direction === 'expense' ? sums.expense : sums.income}
              centerLabel={direction === 'expense' ? 'Spent' : 'Received'}
              centerValue={money(direction === 'expense' ? sums.expense : sums.income, s, { compact: true })}
              formatValue={fmt}
              onSelect={drillToSlice}
            />
            <div className="mt-3">
              <RowBars
                items={cats.map((c) => ({
                  key: c.name,
                  label: c.name,
                  value: c.value,
                  color: c.color,
                  meta: `${Math.round(c.share * 100)}%`,
                }))}
                formatValue={fmt}
                compact
                onSelect={drillToSlice}
              />
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Top merchants" subtitle="Ranked by total spend in this period" />
          <CardBody className="redact pt-2">
            {merchants.length ? (
              <RowBars
                // Colour follows the merchant's category, not its rank, so
                // filtering the list never repaints the survivors.
                items={merchants.map((m) => ({
                  key: m.key,
                  label: m.name,
                  value: m.total,
                  color: categoryColor(config.categories, m.category),
                  meta: `${m.count}× · avg ${money(m.average, s, { compact: true, decimals: 0 })}`,
                }))}
                formatValue={fmt}
                onSelect={(key) => {
                  const row = merchants.find((m) => m.key === key);
                  if (row) drillTo({ search: row.name });
                }}
              />
            ) : (
              <EmptyState title="No spending in this period" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Which days cost most" subtitle="Total spend by day of week" />
          <CardBody className="redact pt-2">
            <RowBars
              items={weekdays
                .map((w) => ({
                  key: String(w.day),
                  label: weekdayNames[w.day],
                  value: w.total,
                  color: 'var(--s1)',
                  meta: `${w.count}×`,
                }))
                .sort((a, b) => b.value - a.value)}
              formatValue={fmt}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Daily rhythm" subtitle="Darker means a bigger spend day" />
          <CardBody className="redact pt-2">
            <HeatGrid
              from={range.from}
              to={range.to > todayISO() ? todayISO() : range.to}
              valueByDate={dailySpend}
              formatValue={(v) => money(v, s)}
              weekStart={s.weekStart}
              locale={s.locale}
              onSelect={(date) => drillTo({ range: { from: date, to: date } })}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Twelve-month trend"
          subtitle={`${formatDate(yearRange.from, s.locale)} – ${formatDate(yearRange.to, s.locale)} · independent of the period above`}
        />
        <CardBody className="redact pt-2">
          <BarSeries
            data={yearly.map((p) => ({ key: p.key, label: p.label, values: [p.income, p.expense] }))}
            series={[
              { label: 'Income', color: 'var(--s6)' },
              { label: 'Spending', color: 'var(--s2)' },
            ]}
            formatValue={(v) => money(v, s)}
            formatTick={fmtTick}
            height={200}
          />
          <div className="mt-4 border-t border-hairline pt-3">
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted">Monthly net</p>
            <AreaLine
              data={yearly.map((p) => ({ key: p.key, label: p.label, value: p.net }))}
              color="var(--s1)"
              formatValue={(v) => money(v, s, { sign: true })}
              formatTick={fmtTick}
              markerLabel="Net"
              height={160}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

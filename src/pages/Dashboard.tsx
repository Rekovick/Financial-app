import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, Sparkles } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ProgressBar } from '@/components/ui/Misc';
import { Stat, SectionTitle } from '@/components/Stat';
import { DonutChart } from '@/components/charts/DonutChart';
import { AreaLine } from '@/components/charts/AreaLine';
import { RowBars } from '@/components/charts/RowBars';
import { TransactionList } from '@/components/TransactionList';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import {
  budgetStatus,
  byCategory,
  byMember,
  cashflow,
  detectRecurring,
  findAnomalies,
  projectPeriod,
  timeSeries,
  totals,
} from '@/lib/analytics';
import { previousRange, daysBetween, formatDate, periodLabel, todayISO, addDays, inRange } from '@/lib/dates';
import { compactNumber, money, pluralize, prettyMerchant } from '@/lib/format';
import { slotColor } from '@/lib/defaults';

export function Dashboard() {
  const { transactions, config } = useStore();
  const { range, setFilter, clearFilter } = useUI();
  const navigate = useNavigate();
  const s = config.settings;

  const fmt = (v: number) => money(v, s, { compact: true });
  const fmtTick = (v: number) => compactNumber(v, s.locale);

  const cur = useMemo(() => totals(transactions, range), [transactions, range]);
  const prev = useMemo(() => totals(transactions, previousRange(range)), [transactions, range]);

  // Plenty of card feeds only ever carry spending. Showing such a ledger a zero
  // income tile and a huge negative "net" states nothing true — so when there is
  // no income anywhere, the overview answers different questions instead.
  const spendOnly = useMemo(() => totals(transactions).income === 0, [transactions]);

  // Twelve trailing weeks, so the tile shows a real trend rather than the
  // two or three points a part-finished month happens to contain.
  const spendTrend = useMemo(
    () => timeSeries(transactions, { from: addDays(todayISO(), -83), to: todayISO() }, 'week', s).map((p) => p.expense),
    [transactions, s],
  );

  const categories = useMemo(
    () => byCategory(transactions, config.categories, range, { limit: 7 }),
    [transactions, config.categories, range],
  );

  const flow = useMemo(() => cashflow(transactions, range), [transactions, range]);

  const budgets = useMemo(
    () => budgetStatus(transactions, config.budgets, config.categories, range),
    [transactions, config.budgets, config.categories, range],
  );

  const recurring = useMemo(() => detectRecurring(transactions), [transactions]);
  const upcoming = useMemo(
    () =>
      recurring
        .filter((r) => r.nextExpected >= todayISO() && r.nextExpected <= addDays(todayISO(), 30) && r.confidence > 0.55)
        .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected))
        .slice(0, 5),
    [recurring],
  );

  const projection = useMemo(() => projectPeriod(transactions, range, recurring), [transactions, range, recurring]);

  // A run rate off a few days of history is a guess, and saying so is the
  // difference between a useful number and a misleading one.
  const historyDays = useMemo(() => {
    const first = transactions.reduce<string | null>((min, t) => (!min || t.date < min ? t.date : min), null);
    return first ? daysBetween(first, todayISO()) + 1 : 0;
  }, [transactions]);
  const thinHistory = historyDays > 0 && historyDays < 21;
  const anomalies = useMemo(() => findAnomalies(transactions, s, range), [transactions, s, range]);
  const members = useMemo(() => byMember(transactions, range, s.members), [transactions, range, s.members]);

  const recent = useMemo(
    () => transactions.filter((t) => inRange(t.date, range)).slice(0, 6),
    [transactions, range],
  );

  const showingCurrentPeriod = range.to >= todayISO();
  const overBudget = budgets.filter((b) => b.state === 'over');

  const pctChange = (a: number, b: number) => (b === 0 ? null : (a - b) / Math.abs(b));

  return (
    <div className="space-y-6">
      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Spent"
          value={money(cur.expense, s, { compact: true })}
          change={pctChange(cur.expense, prev.expense)}
          goodDirection="down"
          trend={spendTrend}
          trendColor="var(--s2)"
        />
        {spendOnly ? (
          <Stat
            label="A day"
            value={money(cur.burnRate, s, { compact: true })}
            sub={pluralize(cur.count, 'transaction')}
            change={pctChange(cur.burnRate, prev.burnRate)}
            goodDirection="down"
          />
        ) : (
          <Stat
            label="Income"
            value={money(cur.income, s, { compact: true })}
            change={pctChange(cur.income, prev.income)}
            goodDirection="up"
            tone="in"
          />
        )}
        {spendOnly ? (
          <Stat
            label="Biggest charge"
            value={cur.largest ? money(cur.largest.amount, s, { compact: true }) : '—'}
            sub={cur.largest ? prettyMerchant(cur.largest.description) : 'nothing yet'}
          />
        ) : (
          <Stat
            label="Net"
            value={`${cur.net < 0 ? '−' : '+'}${money(Math.abs(cur.net), s, { compact: true })}`}
            sub={cur.net >= 0 ? 'saved' : 'overspent'}
            change={pctChange(cur.net, prev.net)}
            goodDirection="up"
          />
        )}
        <Stat
          label={showingCurrentPeriod ? 'Projected spend' : 'Daily average'}
          value={money(showingCurrentPeriod ? projection.projected : cur.burnRate, s, { compact: true })}
          sub={
            !showingCurrentPeriod
              ? 'per day'
              : thinHistory
                ? `rough — only ${pluralize(historyDays, 'day')} of history`
                : projection.daysLeft > 0
                  ? `${pluralize(projection.daysLeft, 'day')} left`
                  : 'period complete'
          }
        />
      </div>

      {(overBudget.length > 0 || anomalies.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {overBudget.length > 0 && (
            <Link
              to="/budgets"
              className="card flex items-center gap-3 p-3.5 transition-colors hover:bg-raised"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-critical/12 text-critical">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">
                  {pluralize(overBudget.length, 'budget')} over the line
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {overBudget.slice(0, 3).map((b) => b.name).join(', ')}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          )}
          {anomalies.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearFilter();
                setFilter({ range, uncategorizedOnly: true });
                navigate('/transactions');
              }}
              className="card flex items-center gap-3 p-3.5 text-left transition-colors hover:bg-raised"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">
                  {pluralize(anomalies.length, 'row')} worth a look
                </span>
                <span className="block truncate text-[12px] text-muted">{anomalies[0].reason}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Where the money went */}
        <Card className="lg:col-span-3">
          <CardHeader
            title="Where it went"
            subtitle={periodLabel(range, s.locale, s.monthStartDay)}
            action={
              <Link to="/insights" className="text-[13px] font-medium text-accent hover:underline">
                Insights
              </Link>
            }
          />
          <CardBody className="pt-2">
            {categories.length ? (
              <div className="grid items-center gap-4 sm:grid-cols-2">
                <div className="redact">
                  <DonutChart
                    data={categories}
                    total={cur.expense}
                    centerLabel="Total spent"
                    centerValue={money(cur.expense, s, { compact: true })}
                    formatValue={fmt}
                    onSelect={(name) => {
                      clearFilter();
                      setFilter({ range, categories: [name] });
                      navigate('/transactions');
                    }}
                  />
                </div>
                {/* Direct labels double as the relief for light-mode contrast. */}
                <div className="redact">
                  <RowBars
                    items={categories.map((c) => ({
                      key: c.name,
                      label: c.name,
                      value: c.value,
                      color: c.color,
                      meta: `${Math.round(c.share * 100)}%`,
                    }))}
                    formatValue={fmt}
                    compact
                    onSelect={(name) => {
                      clearFilter();
                      setFilter({ range, categories: [name] });
                      navigate('/transactions');
                    }}
                  />
                </div>
              </div>
            ) : (
              <EmptyState title="No spending in this period" body="Pick a different date range, or add a transaction." />
            )}
          </CardBody>
        </Card>

        {/* Budgets */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Budgets"
            subtitle={config.budgets.length ? `${budgets.filter((b) => b.state === 'ok').length} of ${budgets.length} on track` : undefined}
            action={
              <Link to="/budgets" className="text-[13px] font-medium text-accent hover:underline">
                Manage
              </Link>
            }
          />
          <CardBody className="pt-3">
            {budgets.length ? (
              <ul className="space-y-3.5">
                {budgets.slice(0, 6).map((b) => (
                  <li key={b.budget.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate font-medium">{b.name}</span>
                      <span className="redact shrink-0 tnum text-muted">
                        {money(b.spent, s, { compact: true, decimals: 0 })} / {money(b.limit, s, { compact: true, decimals: 0 })}
                      </span>
                    </div>
                    <ProgressBar
                      ratio={b.ratio}
                      color={b.color}
                      markerRatio={b.limit ? b.projected / b.limit : undefined}
                      label={`${b.name} budget`}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No budgets yet"
                body="Set a monthly cap on the categories that tend to run away."
                action={
                  <Button variant="primary" size="sm" onClick={() => navigate('/budgets')}>
                    Create a budget
                  </Button>
                }
              />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Running position */}
      <Card>
        <CardHeader
          title={spendOnly ? 'Spending so far' : 'Running position'}
          subtitle={
            spendOnly
              ? 'Adding up, day by day across the period'
              : 'Income minus spending, day by day across the period'
          }
        />
        <CardBody className="redact pt-1">
          <AreaLine
            data={flow.map((p) => ({
              key: p.date,
              label: formatDate(p.date, s.locale, 'short'),
              // With no income the running position is just spend, upside down.
              value: spendOnly ? -p.balance : p.balance,
            }))}
            color={spendOnly ? 'var(--s2)' : cur.net >= 0 ? 'var(--s6)' : 'var(--s8)'}
            formatValue={(v) => money(v, s, { sign: !spendOnly })}
            formatTick={fmtTick}
            markerLabel={spendOnly ? 'Spent so far' : 'Net so far'}
            zeroBaseline
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming */}
        <Card>
          <CardHeader
            title="Coming up"
            subtitle="Recurring charges expected in the next 30 days"
            action={
              <Link to="/recurring" className="text-[13px] font-medium text-accent hover:underline">
                All
              </Link>
            }
          />
          <CardBody className="pt-2">
            {upcoming.length ? (
              <ul className="divide-y divide-hairline">
                {upcoming.map((r) => (
                  <li key={r.key} className="flex items-center gap-3 py-2.5">
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{r.name}</span>
                      <span className="block text-[12px] text-muted">
                        {formatDate(r.nextExpected, s.locale)} · {r.cadence}
                      </span>
                    </span>
                    <span className="redact shrink-0 text-[13.5px] font-semibold tnum">
                      {r.amountVaries ? '≈' : ''}
                      {money(r.average, s)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Nothing detected yet"
                body="Once a merchant charges you three times on a regular rhythm, it shows up here."
              />
            )}
          </CardBody>
        </Card>

        {/* Who spent what */}
        <Card>
          <CardHeader title="Who spent what" subtitle={periodLabel(range, s.locale, s.monthStartDay)} />
          <CardBody className="redact pt-2">
            {members.length ? (
              <RowBars
                items={members.map((m) => ({
                  key: m.member,
                  label: m.member,
                  value: m.expense,
                  color: slotColor(m.slot),
                  meta: `${Math.round(m.share * 100)}% · ${m.count}`,
                }))}
                formatValue={fmt}
                onSelect={(member) => {
                  clearFilter();
                  setFilter({ range, members: [member] });
                  navigate('/transactions');
                }}
              />
            ) : (
              <EmptyState title="No one assigned yet" body="Tag transactions with who spent them to see the split." />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Recent */}
      <div>
        <SectionTitle
          action={
            <Link to="/transactions" className="text-[13px] font-medium text-accent hover:underline">
              See all
            </Link>
          }
        >
          Latest activity
        </SectionTitle>
        <Card className="clip-round">
          {recent.length ? (
            <TransactionList transactions={recent} showDayTotals={false} />
          ) : (
            <EmptyState title="No transactions in this period" body="Try a wider date range." />
          )}
        </Card>
      </div>

      {overBudget.length > 0 && (
        <p className="px-1 text-[12px] text-muted">
          <Badge tone="critical">Over</Badge> means spending has passed the cap for this period.
        </p>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Lock, LockOpen, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Segmented } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Misc';
import { useStore } from '@/lib/store';
import { niceRound, periodsAvailable, planBudgets } from '@/lib/budgetPlanner';
import { categoryColor } from '@/lib/defaults';
import { currencySymbol, money, parseAmount, percent, pluralize } from '@/lib/format';
import { fromISO, todayISO } from '@/lib/dates';
import { makeId } from '@/lib/id';
import { cn } from '@/lib/cn';
import type { Budget } from '@/lib/types';

/**
 * "I want to spend X this month" → a budget for every category.
 * The maths lives in lib/budgetPlanner; this is the conversation around it.
 */
export function BudgetPlanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { transactions, config, updateConfig, toast, undoLast } = useStore();
  const s = config.settings;
  const asOf = todayISO();

  const available = useMemo(
    () => periodsAvailable(transactions, asOf, s.monthStartDay, 6),
    [transactions, asOf, s.monthStartDay],
  );
  const monthChoices = [1, 3, 6].filter((n) => n <= Math.max(1, available));
  const [months, setMonths] = useState(Math.min(3, Math.max(1, available)));
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [targetText, setTargetText] = useState('');

  // What an unchanged month costs — the anchor every other number is read against.
  const baseline = useMemo(
    () =>
      available
        ? planBudgets({ transactions, categories: config.categories, asOf, monthStartDay: s.monthStartDay, target: 0, months, overrides })
        : null,
    [available, transactions, config.categories, asOf, s.monthStartDay, months, overrides],
  );
  const typical = baseline?.typicalTotal ?? 0;

  // Start the target at a modest 10% under a typical month, once per opening.
  useEffect(() => {
    if (!open || !typical) return;
    setTargetText((cur) => cur || String(niceRound(typical * 0.9)));
  }, [open, typical]);

  useEffect(() => {
    if (!open) {
      setTargetText('');
      setOverrides({});
    }
  }, [open]);

  const target = parseAmount(targetText) ?? 0;
  const plan = useMemo(
    () =>
      available && target > 0
        ? planBudgets({ transactions, categories: config.categories, asOf, monthStartDay: s.monthStartDay, target, months, overrides })
        : null,
    [available, target, transactions, config.categories, asOf, s.monthStartDay, months, overrides],
  );

  const fmt = (v: number) => money(v, s, { decimals: 0 });
  const periodNames = (plan ?? baseline)?.periods
    .map((p) => fromISO(p.from).toLocaleDateString(s.locale, { month: 'short' }))
    .join(', ');

  const existing = new Set(config.budgets.map((b) => b.categoryId));
  const willReplace = plan?.rows.filter((r) => r.categoryId && existing.has(r.categoryId) && r.suggested > 0).length ?? 0;

  const apply = async () => {
    if (!plan) return;
    const byCategory = new Map(config.budgets.map((b) => [b.categoryId, b]));
    let changed = 0;
    for (const row of plan.rows) {
      if (!row.categoryId || row.suggested <= 0) continue;
      const prior = byCategory.get(row.categoryId);
      // Keep someone's rollover choice; only the amount is the plan's to set.
      byCategory.set(row.categoryId, {
        id: prior?.id ?? makeId('bud'),
        categoryId: row.categoryId,
        amount: row.suggested,
        rollover: prior?.rollover ?? false,
      } satisfies Budget);
      changed++;
    }
    await updateConfig({ budgets: [...byCategory.values()] });
    toast({
      message: `Set ${pluralize(changed, 'budget')} totalling ${fmt(plan.total)}`,
      tone: 'success',
      action: { label: 'Undo', run: () => void undoLast() },
    });
    onClose();
  };

  const presets = typical
    ? [
        { label: 'Typical', value: niceRound(typical) },
        { label: '−10%', value: niceRound(typical * 0.9) },
        { label: '−20%', value: niceRound(typical * 0.8) },
        { label: '−30%', value: niceRound(typical * 0.7) },
      ]
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plan a month"
      description="Set what you want to spend. Fixed costs keep their real price; everything else shares what's left."
      size="lg"
      footer={
        available ? (
          <>
            <span className="mr-auto text-[12.5px] text-muted">
              {willReplace > 0 && `Updates ${pluralize(willReplace, 'existing budget')}`}
            </span>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!plan || !plan.feasible} onClick={() => void apply()}>
              Use this plan
            </Button>
          </>
        ) : undefined
      }
    >
      {!available ? (
        <EmptyState
          title="Not enough history yet"
          body="Planning needs at least one complete month of transactions to learn from. Check back after this month ends — or load your older months into the sheet."
        />
      ) : (
        <div className="space-y-5">
          <div>
            <Label htmlFor="plan-target" hint={`a typical month is ${fmt(typical)}`}>
              Target for the month
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-medium text-muted">
                {currencySymbol(s.currency, s.locale)}
              </span>
              <input
                id="plan-target"
                data-autofocus
                inputMode="decimal"
                autoComplete="off"
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                className="field h-14 pl-14 text-2xl font-semibold tnum"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setTargetText(String(p.value))}
                  className={cn('chip', target === p.value && 'chip-on')}
                >
                  {p.label}
                  <span className="tnum text-[11.5px] opacity-75">{fmt(p.value)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-muted">
              Learning from {periodNames}
              {available < 3 && ` — only ${pluralize(available, 'complete month')} so far`}
            </p>
            {monthChoices.length > 1 && (
              <Segmented
                size="sm"
                value={String(months)}
                onChange={(v) => setMonths(Number(v))}
                options={monthChoices.map((n) => ({ value: String(n), label: `${n} mo` }))}
              />
            )}
          </div>

          {plan && (
            <>
              {!plan.feasible ? (
                <div className="flex gap-2.5 rounded-xl border border-critical/30 bg-critical/[0.07] p-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                  <p className="text-[13px] leading-relaxed">
                    <span className="font-semibold">Your fixed costs alone are {fmt(plan.fixedTotal)}</span>
                    <span className="text-ink-2">
                      {' '}
                      — more than this target. Raise the target, or unlock a cost below if it really can come down
                      this month.
                    </span>
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-hairline bg-raised p-3 text-center">
                  <Figure label="Fixed" value={fmt(plan.fixedTotal)} />
                  <Figure label="Flexible" value={fmt(plan.flexibleBudget)} />
                  <Figure
                    label={plan.cut >= 0 ? 'Flexible cut' : 'Flexible room'}
                    value={percent(Math.abs(plan.cut), s.locale)}
                    tone={plan.cut > 0.35 ? 'warn' : undefined}
                  />
                </div>
              )}

              {plan.feasible && plan.cut > 0.35 && (
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  That's a steep cut to everyday spending. Plans that ask for more than about a third less rarely hold —
                  consider a gentler target and tightening next month.
                </p>
              )}

              <div>
                <div className="mb-1.5 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <span>Category</span>
                  <span>Usual → Plan</span>
                </div>
                <ul className="divide-y divide-hairline rounded-xl border border-hairline">
                  {plan.rows.map((r) => {
                    const delta = r.suggested - r.average;
                    return (
                      <li key={r.name} className="flex items-center gap-3 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setOverrides((o) => ({ ...o, [r.name]: !r.fixed }))}
                          aria-pressed={r.fixed}
                          aria-label={r.fixed ? `Unlock ${r.name}` : `Lock ${r.name} at its usual cost`}
                          title={r.fixed ? 'Fixed — held at its usual cost. Tap to let it flex.' : 'Flexible — tap to hold it fixed.'}
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                            r.fixed
                              ? 'border-ink/15 bg-hairline text-ink'
                              : 'border-hairline text-muted hover:text-ink',
                          )}
                        >
                          {r.fixed ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                        </button>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: categoryColor(config.categories, r.name) }}
                              aria-hidden
                            />
                            <span className="truncate text-[13.5px] font-medium">{r.name}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                            {r.fixed
                              ? r.fixedReason === 'steady'
                                ? 'fixed · same every month'
                                : r.fixedReason === 'bills'
                                  ? 'fixed · regular bills'
                                  : 'fixed · held by you'
                              : r.low === r.high
                                ? 'flexible'
                                : `flexible · ${fmt(r.low)}–${fmt(r.high)} a month`}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[11.5px] tnum text-muted">{fmt(r.average)}</span>
                          <span className="block text-[14px] font-semibold tnum">{fmt(r.suggested)}</span>
                          {!r.fixed && Math.abs(delta) >= 1 && (
                            <span className={cn('block text-[11px] tnum', delta < 0 ? 'text-ink-2' : 'text-good')}>
                              {delta < 0 ? '−' : '+'}
                              {fmt(Math.abs(delta))}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 flex items-baseline justify-between px-1 text-[13px]">
                  <span className="text-muted">Plan total</span>
                  <span className="font-semibold tnum">{fmt(plan.total)}</span>
                </div>
              </div>

              <p className="text-[12px] leading-relaxed text-muted">
                Tap a lock to switch a category between fixed and flexible. "Usual" is the average of those months,
                quiet months counted as zero.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn('mt-0.5 truncate text-[15px] font-semibold tnum', tone === 'warn' && 'text-serious')}>{value}</p>
    </div>
  );
}

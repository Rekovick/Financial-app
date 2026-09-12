import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ProgressBar } from '@/components/ui/Misc';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Input, Label, Switch } from '@/components/ui/Field';
import { CategoryPicker } from '@/components/CategoryPicker';
import { Stat } from '@/components/Stat';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { budgetStatus, byCategory, countable } from '@/lib/analytics';
import { inRange, periodLabel, previousRange, rangeLength, daysBetween, todayISO } from '@/lib/dates';
import { money, parseAmount, percent, pluralize } from '@/lib/format';
import { makeId } from '@/lib/id';
import { categoryByName } from '@/lib/defaults';
import type { Budget } from '@/lib/types';

export function Budgets() {
  const { transactions, config, updateConfig, toast } = useStore();
  const { range, setFilter, clearFilter } = useUI();
  const navigate = useNavigate();
  const s = config.settings;

  const [editing, setEditing] = useState<Budget | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Budget | null>(null);

  const statuses = useMemo(
    () => budgetStatus(transactions, config.budgets, config.categories, range),
    [transactions, config.budgets, config.categories, range],
  );

  const totalLimit = statuses.reduce((sum, b) => sum + b.limit, 0);
  const totalSpent = statuses.reduce((sum, b) => sum + b.spent, 0);

  // Spending that no budget covers — the number people forget to look at.
  const budgetedNames = new Set(statuses.map((b) => b.name));
  const unbudgeted = useMemo(() => {
    let sum = 0;
    for (const t of transactions) {
      if (!countable(t) || t.type !== 'expense' || !inRange(t.date, range)) continue;
      if (!budgetedNames.has(t.category)) sum += t.amount;
    }
    return sum;
  }, [transactions, range, budgetedNames]);

  const elapsed = Math.min(rangeLength(range), Math.max(1, daysBetween(range.from, todayISO()) + 1));
  const pace = elapsed / rangeLength(range);

  const save = async (b: Budget) => {
    const exists = config.budgets.some((x) => x.id === b.id);
    await updateConfig({
      budgets: exists ? config.budgets.map((x) => (x.id === b.id ? b : x)) : [...config.budgets, b],
    });
    toast({ message: exists ? 'Budget updated' : 'Budget created', tone: 'success' });
    setEditing(null);
    setCreating(false);
  };

  const suggest = async () => {
    // Median of the last three periods, rounded up to something memorable.
    const spendByCat = new Map<string, number[]>();
    for (let i = 1; i <= 3; i++) {
      let r = range;
      for (let k = 0; k < i; k++) r = previousRange(r);
      const rows = byCategory(transactions, config.categories, r, { limit: 40 });
      for (const row of rows) {
        const arr = spendByCat.get(row.name) ?? [];
        arr.push(row.value);
        spendByCat.set(row.name, arr);
      }
    }
    const existing = new Set(config.budgets.map((b) => b.categoryId));
    const added: Budget[] = [];
    for (const [name, values] of spendByCat) {
      if (values.length < 2) continue;
      const cat = categoryByName(config.categories, name);
      if (!cat || existing.has(cat.id) || cat.group === 'income' || cat.group === 'transfer') continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg < 25) continue;
      const rounded = Math.ceil((avg * 1.05) / 25) * 25;
      added.push({ id: makeId('bud'), categoryId: cat.id, amount: rounded, rollover: false });
    }
    if (!added.length) {
      toast({ message: 'Not enough history yet to suggest budgets.', tone: 'info' });
      return;
    }
    await updateConfig({ budgets: [...config.budgets, ...added] });
    toast({ message: `Added ${pluralize(added.length, 'budget')} from your recent averages`, tone: 'success' });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Budgeted" value={money(totalLimit, s, { compact: true })} sub={pluralize(statuses.length, 'category', 'categories')} />
        <Stat
          label="Spent against it"
          value={money(totalSpent, s, { compact: true })}
          sub={totalLimit ? `${percent(totalSpent / totalLimit, s.locale)} of cap` : undefined}
        />
        <Stat
          label="Left to spend"
          value={money(Math.max(0, totalLimit - totalSpent), s, { compact: true })}
          sub={totalSpent > totalLimit ? `${money(totalSpent - totalLimit, s, { compact: true })} over` : 'across all budgets'}
        />
        <Stat label="Unbudgeted spend" value={money(unbudgeted, s, { compact: true })} sub="no cap set" />
      </div>

      <Card>
        <CardHeader
          title="Budgets"
          subtitle={periodLabel(range, s.locale, s.monthStartDay)}
          action={
            <div className="flex gap-2">
              {config.budgets.length === 0 && (
                <Button size="sm" variant="secondary" onClick={() => void suggest()}>
                  <Sparkles className="h-4 w-4" />
                  Suggest
                </Button>
              )}
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
          }
        />
        <CardBody className="pt-3">
          {statuses.length ? (
            <ul className="space-y-4">
              {statuses.map((b) => (
                <li key={b.budget.id} className="group">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        clearFilter();
                        setFilter({ range, categories: [b.name] });
                        navigate('/transactions');
                      }}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      <span className="truncate text-[14px] font-medium">{b.name}</span>
                      {b.state === 'over' && <Badge tone="critical">Over</Badge>}
                      {b.state === 'watch' && <Badge tone="warning">Watch</Badge>}
                      {b.carried !== 0 && (
                        <Badge tone="neutral">
                          {b.carried > 0 ? '+' : '−'}
                          {money(Math.abs(b.carried), s, { compact: true, decimals: 0 })} carried
                        </Badge>
                      )}
                    </button>
                    <span className="redact shrink-0 text-[13px] tnum text-muted">
                      <span className="font-semibold text-ink">{money(b.spent, s, { compact: true, decimals: 0 })}</span>
                      {' / '}
                      {money(b.limit, s, { compact: true, decimals: 0 })}
                    </span>
                  </div>
                  <ProgressBar ratio={b.ratio} color={b.color} height={10} markerRatio={b.limit ? b.projected / b.limit : undefined} label={`${b.name} budget`} />
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] text-muted">
                    <span className="redact">
                      {b.remaining >= 0
                        ? `${money(b.remaining, s, { compact: true })} left`
                        : `${money(-b.remaining, s, { compact: true })} over`}
                      {b.state !== 'over' && b.projected > b.limit && (
                        <span className="ml-1.5 text-warning">· heading for {money(b.projected, s, { compact: true, decimals: 0 })}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <button type="button" onClick={() => setEditing(b.budget)} className="font-medium text-accent hover:underline">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(b.budget)}
                        aria-label={`Delete ${b.name} budget`}
                        className="text-muted hover:text-critical"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<TriangleAlert className="h-5 w-5" />}
              title="No budgets yet"
              body="Budgets turn a pile of transactions into a simple question: are we on track? Start with the two or three categories that tend to surprise you."
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    Create one
                  </Button>
                  <Button variant="secondary" onClick={() => void suggest()}>
                    <Sparkles className="h-4 w-4" />
                    Suggest from history
                  </Button>
                </div>
              }
            />
          )}
        </CardBody>
      </Card>

      {statuses.length > 0 && (
        <p className="px-1 text-[12px] leading-relaxed text-muted">
          The tick on each bar is where this budget is heading at the current pace
          ({percent(pace, s.locale)} of the period has passed).
        </p>
      )}

      <BudgetEditor
        open={creating || editing != null}
        budget={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSave={save}
      />

      <ConfirmDialog
        open={removing != null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          void updateConfig({ budgets: config.budgets.filter((b) => b.id !== removing.id) });
          toast({ message: 'Budget removed', tone: 'info' });
        }}
        title="Remove this budget?"
        body="Your transactions are untouched — only the monthly cap goes away."
      />
    </div>
  );
}

function BudgetEditor({
  open,
  budget,
  onClose,
  onSave,
}: {
  open: boolean;
  budget: Budget | null;
  onClose: () => void;
  onSave: (b: Budget) => void;
}) {
  const { config } = useStore();
  const existing = budget ? config.categories.find((c) => c.id === budget.categoryId) : undefined;

  const [category, setCategory] = useState(existing?.name ?? '');
  const [amount, setAmount] = useState(budget ? String(budget.amount) : '');
  const [rollover, setRollover] = useState(budget?.rollover ?? false);

  // Re-seed whenever the dialog opens on a different budget.
  const key = `${open}-${budget?.id ?? 'new'}`;
  const [seeded, setSeeded] = useState(key);
  if (seeded !== key) {
    setSeeded(key);
    setCategory(existing?.name ?? '');
    setAmount(budget ? String(budget.amount) : '');
    setRollover(budget?.rollover ?? false);
  }

  const parsedAmount = parseAmount(amount);
  const cat = categoryByName(config.categories, category);
  const taken = config.budgets.some((b) => b.categoryId === cat?.id && b.id !== budget?.id);
  const valid = !!cat && parsedAmount != null && parsedAmount > 0 && !taken;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={budget ? 'Edit budget' : 'New budget'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              cat &&
              parsedAmount != null &&
              onSave({
                id: budget?.id ?? makeId('bud'),
                categoryId: cat.id,
                amount: parsedAmount,
                rollover,
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Category</Label>
          <CategoryPicker value={category} onChange={setCategory} categories={config.categories} />
          {taken && <p className="mt-1 text-[12px] text-critical">That category already has a budget.</p>}
        </div>
        <div>
          <Label htmlFor="b-amt">Monthly cap</Label>
          <Input
            id="b-amt"
            data-autofocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="tnum"
          />
        </div>
        <div className="rounded-xl border border-hairline px-3">
          <Switch
            checked={rollover}
            onChange={setRollover}
            label="Roll unspent money forward"
            description="Anything left over raises next period's cap; overspending lowers it."
          />
        </div>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { Plus, Target, Trash2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ProgressBar } from '@/components/ui/Misc';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Input, Label } from '@/components/ui/Field';
import { useStore } from '@/lib/store';
import { daysBetween, formatDate, todayISO } from '@/lib/dates';
import { money, parseAmount, percent } from '@/lib/format';
import { makeId } from '@/lib/id';
import { slotColor } from '@/lib/defaults';
import type { Goal } from '@/lib/types';

export function Goals() {
  const { config, updateConfig, toast } = useStore();
  const s = config.settings;
  const [editing, setEditing] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Goal | null>(null);

  const save = async (g: Goal) => {
    const exists = config.goals.some((x) => x.id === g.id);
    await updateConfig({ goals: exists ? config.goals.map((x) => (x.id === g.id ? g : x)) : [...config.goals, g] });
    toast({ message: exists ? 'Goal updated' : 'Goal created', tone: 'success' });
    setEditing(null);
    setCreating(false);
  };

  const addToGoal = async (g: Goal, delta: number) => {
    const saved = Math.max(0, g.saved + delta);
    await updateConfig({ goals: config.goals.map((x) => (x.id === g.id ? { ...x, saved } : x)) });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Savings goals"
          subtitle="Tracked by hand — update the balance whenever you move money"
          action={
            <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New goal
            </Button>
          }
        />
        <CardBody className="pt-3">
          {config.goals.length ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {config.goals.map((g) => {
                const ratio = g.target > 0 ? g.saved / g.target : 0;
                const remaining = Math.max(0, g.target - g.saved);
                const days = g.targetDate ? daysBetween(todayISO(), g.targetDate) : null;
                const perMonth = days && days > 0 ? remaining / (days / 30.44) : null;
                return (
                  <li key={g.id} className="rounded-2xl border border-hairline p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-semibold">{g.name}</p>
                        {g.note && <p className="mt-0.5 truncate text-[12px] text-muted">{g.note}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(g)}
                          className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent/10"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemoving(g)}
                          aria-label={`Delete ${g.name}`}
                          className="rounded-md p-1 text-muted hover:text-critical"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="redact mt-3 text-2xl font-semibold tracking-tight tnum">
                      {money(g.saved, s, { compact: true })}
                      <span className="ml-1.5 text-[13px] font-normal text-muted">
                        of {money(g.target, s, { compact: true })}
                      </span>
                    </p>

                    <div className="mt-2.5">
                      <ProgressBar ratio={ratio} color={slotColor(g.slot)} height={10} label={g.name} />
                    </div>

                    <div className="mt-2 flex items-baseline justify-between gap-2 text-[12px] text-muted">
                      <span className="redact">
                        {percent(Math.min(1, ratio), s.locale)} there ·{' '}
                        {remaining > 0 ? `${money(remaining, s, { compact: true })} to go` : 'complete'}
                      </span>
                      {g.targetDate && (
                        <span>
                          {days != null && days > 0
                            ? `by ${formatDate(g.targetDate, s.locale, 'short')}`
                            : `due ${formatDate(g.targetDate, s.locale, 'short')}`}
                        </span>
                      )}
                    </div>

                    {perMonth != null && perMonth > 0 && (
                      <p className="redact mt-1 text-[12px] text-muted">
                        Needs about <span className="font-medium text-ink">{money(perMonth, s, { compact: true, decimals: 0 })}</span> a
                        month to land on time.
                      </p>
                    )}

                    <div className="mt-3 flex gap-1.5">
                      {[50, 100, 250].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => void addToGoal(g, amt)}
                          className="chip flex-1 justify-center hover:border-accent/40 hover:text-accent"
                        >
                          +{money(amt, s, { decimals: 0 })}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<Target className="h-5 w-5" />}
              title="No goals yet"
              body="A goal is a target and a running balance — an emergency fund, a trip, a deposit. Nothing is deducted from your transactions; you decide what counts."
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create a goal
                </Button>
              }
            />
          )}
        </CardBody>
      </Card>

      <GoalEditor
        open={creating || editing != null}
        goal={editing}
        nextSlot={(config.goals.length % 8) + 1}
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
          void updateConfig({ goals: config.goals.filter((g) => g.id !== removing.id) });
          toast({ message: 'Goal removed', tone: 'info' });
        }}
        title="Remove this goal?"
        body="Only the goal is deleted — your transactions are untouched."
      />
    </div>
  );
}

function GoalEditor({
  open,
  goal,
  nextSlot,
  onClose,
  onSave,
}: {
  open: boolean;
  goal: Goal | null;
  nextSlot: number;
  onClose: () => void;
  onSave: (g: Goal) => void;
}) {
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [saved, setSaved] = useState(goal ? String(goal.saved) : '0');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [note, setNote] = useState(goal?.note ?? '');

  const key = `${open}-${goal?.id ?? 'new'}`;
  const [seeded, setSeeded] = useState(key);
  if (seeded !== key) {
    setSeeded(key);
    setName(goal?.name ?? '');
    setTarget(goal ? String(goal.target) : '');
    setSaved(goal ? String(goal.saved) : '0');
    setTargetDate(goal?.targetDate ?? '');
    setNote(goal?.note ?? '');
  }

  const t = parseAmount(target);
  const sv = parseAmount(saved) ?? 0;
  const valid = name.trim().length > 0 && t != null && t > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={goal ? 'Edit goal' : 'New goal'}
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
              t != null &&
              onSave({
                id: goal?.id ?? makeId('goal'),
                name: name.trim(),
                target: t,
                saved: Math.max(0, sv),
                targetDate: targetDate || undefined,
                note: note.trim() || undefined,
                slot: goal?.slot ?? nextSlot,
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
          <Label htmlFor="g-name">Name</Label>
          <Input id="g-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="g-target">Target</Label>
            <Input id="g-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="tnum" />
          </div>
          <div>
            <Label htmlFor="g-saved">Saved so far</Label>
            <Input id="g-saved" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} className="tnum" />
          </div>
        </div>
        <div>
          <Label htmlFor="g-date" hint="optional">
            Target date
          </Label>
          <Input id="g-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="g-note" hint="optional">
            Note
          </Label>
          <Input id="g-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this matters" />
        </div>
      </div>
    </Modal>
  );
}

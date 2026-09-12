import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Wand2, Zap } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState } from '@/components/ui/Misc';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Input, Label, Select, Switch } from '@/components/ui/Field';
import { CategoryPicker } from '@/components/CategoryPicker';
import { TagInput } from '@/components/TagInput';
import { useStore } from '@/lib/store';
import {
  NUMBER_OPS,
  RULE_FIELD_LABELS,
  RULE_OP_LABELS,
  TEXT_OPS,
  previewRule,
} from '@/lib/rules';
import { allTags } from '@/lib/analytics';
import { pluralize, prettyMerchant } from '@/lib/format';
import { makeId } from '@/lib/id';
import { UNCATEGORIZED } from '@/lib/defaults';
import type { Rule, RuleCondition, RuleField, RuleOp, TxnType } from '@/lib/types';

const blankRule = (): Rule => ({
  id: makeId('rule'),
  name: '',
  enabled: true,
  conditions: [{ field: 'description', op: 'contains', value: '' }],
  actions: {},
});

export function Rules() {
  const { config, transactions, updateConfig, runRules, toast, undoLast } = useStore();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Rule | null>(null);
  const [running, setRunning] = useState(false);

  const uncategorized = useMemo(
    () => transactions.filter((t) => !t.category || t.category === UNCATEGORIZED).length,
    [transactions],
  );

  const save = async (r: Rule) => {
    const exists = config.rules.some((x) => x.id === r.id);
    await updateConfig({ rules: exists ? config.rules.map((x) => (x.id === r.id ? r : x)) : [...config.rules, r] });
    toast({ message: exists ? 'Rule saved' : 'Rule created', tone: 'success' });
    setEditing(null);
    setCreating(false);
  };

  const move = async (index: number, delta: number) => {
    const next = [...config.rules];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await updateConfig({ rules: next });
  };

  const applyAll = async () => {
    setRunning(true);
    const n = await runRules();
    setRunning(false);
    toast({
      message: n ? `Updated ${pluralize(n, 'transaction')}` : 'Nothing needed changing',
      tone: n ? 'success' : 'info',
      action: n ? { label: 'Undo', run: () => void undoLast() } : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Automation rules"
          subtitle="Rules run top to bottom — a later rule can override an earlier one"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" loading={running} disabled={!config.rules.length} onClick={() => void applyAll()}>
                <Zap className="h-4 w-4" />
                Run now
              </Button>
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                New rule
              </Button>
            </div>
          }
        />
        <CardBody className="pt-3">
          {config.rules.length ? (
            <ul className="space-y-2.5">
              {config.rules.map((rule, i) => {
                const matches = previewRule(rule, transactions).length;
                return (
                  <li key={rule.id} className="flex items-start gap-3 rounded-xl border border-hairline p-3">
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => void move(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                        className="rounded p-0.5 text-muted hover:bg-hairline hover:text-ink disabled:opacity-25"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void move(i, 1)}
                        disabled={i === config.rules.length - 1}
                        aria-label="Move down"
                        className="rounded p-0.5 text-muted hover:bg-hairline hover:text-ink disabled:opacity-25"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button type="button" onClick={() => setEditing(rule)} className="min-w-0 flex-1 text-left">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[14px] font-medium">{rule.name || 'Untitled rule'}</span>
                        {!rule.enabled && <Badge tone="neutral">Off</Badge>}
                        <Badge tone={matches ? 'accent' : 'neutral'}>{matches} match{matches === 1 ? '' : 'es'}</Badge>
                      </span>
                      <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
                        {describe(rule)}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.enabled}
                        aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                        onClick={() =>
                          void updateConfig({
                            rules: config.rules.map((x) => (x.id === rule.id ? { ...x, enabled: !x.enabled } : x)),
                          })
                        }
                        className={`relative h-5 w-9 rounded-full transition-colors ${rule.enabled ? 'bg-accent' : 'bg-line'}`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                            rule.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(rule)}
                        aria-label={`Delete ${rule.name}`}
                        className="rounded p-1.5 text-muted hover:text-critical"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<Wand2 className="h-5 w-5" />}
              title="No rules yet"
              body={
                uncategorized
                  ? `${pluralize(uncategorized, 'transaction')} still have no category. A rule like “description contains UBER → Transport” fixes all of them at once, and keeps fixing new ones.`
                  : 'Rules categorize, rename, tag or exclude transactions automatically as they arrive from your sheet.'
              }
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create your first rule
                </Button>
              }
            />
          )}
        </CardBody>
      </Card>

      <RuleEditor
        open={creating || editing != null}
        rule={editing}
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
          void updateConfig({ rules: config.rules.filter((r) => r.id !== removing.id) });
          toast({ message: 'Rule deleted', tone: 'info' });
        }}
        title="Delete this rule?"
        body="Transactions it already changed keep their values — only the rule goes away."
      />
    </div>
  );
}

function describe(rule: Rule): string {
  const when = rule.conditions
    .map((c) => `${RULE_FIELD_LABELS[c.field].toLowerCase()} ${RULE_OP_LABELS[c.op]} “${c.value}”`)
    .join(' and ');
  const then: string[] = [];
  if (rule.actions.category) then.push(`set category to ${rule.actions.category}`);
  if (rule.actions.member) then.push(`assign to ${rule.actions.member}`);
  if (rule.actions.type) then.push(`mark as ${rule.actions.type}`);
  if (rule.actions.renameTo) then.push(`rename to “${rule.actions.renameTo}”`);
  if (rule.actions.addTags?.length) then.push(`tag ${rule.actions.addTags.join(', ')}`);
  if (rule.actions.excluded) then.push('exclude from reports');
  return `When ${when || '…'}, ${then.length ? then.join(' and ') : 'do nothing yet'}.`;
}

function RuleEditor({
  open,
  rule,
  onClose,
  onSave,
}: {
  open: boolean;
  rule: Rule | null;
  onClose: () => void;
  onSave: (r: Rule) => void;
}) {
  const { config, transactions } = useStore();
  const [draft, setDraft] = useState<Rule>(rule ?? blankRule());

  const key = `${open}-${rule?.id ?? 'new'}`;
  const [seeded, setSeeded] = useState(key);
  if (seeded !== key) {
    setSeeded(key);
    setDraft(rule ?? blankRule());
  }

  const matches = useMemo(() => previewRule(draft, transactions), [draft, transactions]);
  const tagSuggestions = useMemo(() => allTags(transactions).slice(0, 10), [transactions]);

  const setCondition = (i: number, patch: Partial<RuleCondition>) =>
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));

  const valid = draft.conditions.some((c) => c.value.trim()) && Object.keys(draft.actions).length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? 'Edit rule' : 'New rule'}
      description="Rules apply to new rows as they sync, and to everything when you press Run now."
      size="lg"
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-muted">
            {matches.length ? `Matches ${pluralize(matches.length, 'transaction')}` : 'No matches yet'}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                ...draft,
                name: draft.name.trim() || autoName(draft),
                conditions: draft.conditions.filter((c) => c.value.trim()),
              })
            }
          >
            Save rule
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label htmlFor="r-name" hint="optional">
            Name
          </Label>
          <Input
            id="r-name"
            data-autofocus
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder={autoName(draft)}
          />
        </div>

        <div>
          <Label hint="all must match">When</Label>
          <div className="space-y-2">
            {draft.conditions.map((c, i) => {
              const ops = c.field === 'amount' ? NUMBER_OPS : TEXT_OPS;
              return (
                <div key={i} className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[140px_150px_1fr_auto]">
                  <Select
                    aria-label="Field"
                    value={c.field}
                    onChange={(e) => {
                      const field = e.target.value as RuleField;
                      const nextOps = field === 'amount' ? NUMBER_OPS : TEXT_OPS;
                      setCondition(i, { field, op: nextOps.includes(c.op) ? c.op : nextOps[0] });
                    }}
                  >
                    {(Object.keys(RULE_FIELD_LABELS) as RuleField[]).map((f) => (
                      <option key={f} value={f}>
                        {RULE_FIELD_LABELS[f]}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="Operator" value={c.op} onChange={(e) => setCondition(i, { op: e.target.value as RuleOp })}>
                    {ops.map((o) => (
                      <option key={o} value={o}>
                        {RULE_OP_LABELS[o]}
                      </option>
                    ))}
                  </Select>
                  <div className="col-span-2 flex gap-2 sm:col-span-1">
                    <Input
                      aria-label="Value"
                      value={c.value}
                      inputMode={c.field === 'amount' ? 'decimal' : 'text'}
                      onChange={(e) => setCondition(i, { value: e.target.value })}
                      placeholder={c.field === 'amount' ? '0.00' : 'e.g. STARBUCKS'}
                    />
                    {c.op === 'between' && (
                      <Input
                        aria-label="Second value"
                        value={c.value2 ?? ''}
                        inputMode="decimal"
                        onChange={(e) => setCondition(i, { value2: e.target.value })}
                        placeholder="and"
                      />
                    )}
                  </div>
                  {draft.conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, x) => x !== i) }))}
                      aria-label="Remove condition"
                      className="col-span-2 justify-self-end rounded-lg p-2 text-muted hover:text-critical sm:col-span-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({ ...d, conditions: [...d.conditions, { field: 'description', op: 'contains', value: '' }] }))
            }
            className="mt-2 text-[13px] font-medium text-accent hover:underline"
          >
            + Add condition
          </button>
        </div>

        <div>
          <Label>Then</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-[12px] text-muted">Set category</span>
              <CategoryPicker
                value={draft.actions.category ?? ''}
                onChange={(category) => setDraft((d) => ({ ...d, actions: { ...d.actions, category } }))}
                categories={config.categories}
                placeholder="Leave unchanged"
              />
            </div>
            <div>
              <span className="mb-1 block text-[12px] text-muted">Assign to</span>
              <Select
                value={draft.actions.member ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, actions: { ...d.actions, member: e.target.value || undefined } }))
                }
              >
                <option value="">Leave unchanged</option>
                {config.settings.members.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <span className="mb-1 block text-[12px] text-muted">Mark as</span>
              <Select
                value={draft.actions.type ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, actions: { ...d.actions, type: (e.target.value || undefined) as TxnType | undefined } }))
                }
              >
                <option value="">Leave unchanged</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </Select>
            </div>
            <div>
              <span className="mb-1 block text-[12px] text-muted">Rename description to</span>
              <Input
                value={draft.actions.renameTo ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, actions: { ...d.actions, renameTo: e.target.value || undefined } }))}
                placeholder="Leave unchanged"
              />
            </div>
          </div>

          <div className="mt-3">
            <span className="mb-1 block text-[12px] text-muted">Add tags</span>
            <TagInput
              value={draft.actions.addTags ?? []}
              onChange={(addTags) => setDraft((d) => ({ ...d, actions: { ...d.actions, addTags: addTags.length ? addTags : undefined } }))}
              suggestions={tagSuggestions}
            />
          </div>

          <div className="mt-2 rounded-xl border border-hairline px-3">
            <Switch
              checked={!!draft.actions.excluded}
              onChange={(excluded) => setDraft((d) => ({ ...d, actions: { ...d.actions, excluded: excluded || undefined } }))}
              label="Exclude matching rows from reports"
              description="Useful for internal transfers and credit-card payments."
            />
          </div>
        </div>

        {matches.length > 0 && (
          <div>
            <Label>Preview · {matches.length} matching</Label>
            <ul className="max-h-40 divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline">
              {matches.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 truncate">{prettyMerchant(t.description)}</span>
                  <span className="shrink-0 text-muted tnum">{t.date}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function autoName(rule: Rule): string {
  const first = rule.conditions.find((c) => c.value.trim());
  const target = rule.actions.category ?? rule.actions.member ?? rule.actions.type ?? 'change';
  return first ? `${first.value} → ${target}` : 'New rule';
}

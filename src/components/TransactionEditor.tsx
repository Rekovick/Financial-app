import { useEffect, useMemo, useState } from 'react';
import { Trash2, Wand2 } from 'lucide-react';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Segmented, Select, Switch, Textarea } from '@/components/ui/Field';
import { CategoryPicker } from './CategoryPicker';
import { TagInput } from './TagInput';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { allAccounts, allTags } from '@/lib/analytics';
import { currencySymbol, parseAmount, prettyMerchant } from '@/lib/format';
import { todayISO } from '@/lib/dates';
import { UNCATEGORIZED } from '@/lib/defaults';
import { ruleFromTransaction } from '@/lib/rules';
import type { Transaction, TxnType } from '@/lib/types';

interface Draft {
  date: string;
  description: string;
  amount: string;
  type: TxnType;
  category: string;
  account: string;
  member: string;
  notes: string;
  tags: string[];
  excluded: boolean;
  cleared: boolean;
}

function toDraft(t: Transaction | null, fallback: { account: string; member: string }): Draft {
  if (!t) {
    return {
      date: todayISO(),
      description: '',
      amount: '',
      type: 'expense',
      category: '',
      account: fallback.account,
      member: fallback.member,
      notes: '',
      tags: [],
      excluded: false,
      cleared: false,
    };
  }
  return {
    date: t.date,
    description: t.description,
    amount: t.amount ? String(t.amount) : '',
    type: t.type,
    category: t.category === UNCATEGORIZED ? '' : t.category,
    account: t.account,
    member: t.member,
    notes: t.notes,
    tags: t.tags,
    excluded: t.excluded,
    cleared: t.cleared,
  };
}

/** Add and edit share one form — the fields and validation are identical. */
export function TransactionEditor() {
  const { editing, quickAddOpen, setEditing, setQuickAdd } = useUI();
  const { config, transactions, createTransaction, saveTransactions, deleteTransactions, updateConfig, toast, undoLast } =
    useStore();

  const open = quickAddOpen || editing != null;
  const isEdit = editing != null;
  const settings = config.settings;

  const accountOptions = useMemo(
    () => [...new Set([...settings.accounts, ...allAccounts(transactions)])].filter(Boolean),
    [settings.accounts, transactions],
  );
  const tagSuggestions = useMemo(() => allTags(transactions).slice(0, 12), [transactions]);

  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(editing, { account: accountOptions[0] ?? '', member: settings.members[0] ?? '' }),
  );
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(editing, { account: accountOptions[0] ?? '', member: settings.members[0] ?? '' }));
    setTouched(false);
    // Re-seeding only on open is deliberate — typing must not be clobbered by a
    // background sync that replaces the `editing` object.
  }, [open, editing?.id]);

  const amount = parseAmount(draft.amount);
  const amountError = touched && (amount == null || amount === 0) ? 'Enter an amount' : null;
  const descError = touched && !draft.description.trim() ? 'Enter a description' : null;
  const valid = !amountError && !descError && amount != null && amount !== 0 && draft.description.trim().length > 0;

  const close = () => {
    setEditing(null);
    setQuickAdd(false);
  };

  const submit = async (addAnother = false) => {
    setTouched(true);
    if (!valid || amount == null) return;

    const payload = {
      date: draft.date,
      description: draft.description.trim(),
      amount: Math.abs(amount),
      type: draft.type,
      category: draft.category || UNCATEGORIZED,
      account: draft.account,
      member: draft.member,
      notes: draft.notes.trim(),
      tags: draft.tags,
      excluded: draft.excluded,
      cleared: draft.cleared,
    };

    if (isEdit && editing) {
      await saveTransactions([{ ...editing, ...payload }], { label: 'Edit transaction' });
      toast({ message: 'Transaction updated', tone: 'success', action: { label: 'Undo', run: () => void undoLast() } });
      close();
      return;
    }

    await createTransaction(payload);
    toast({ message: 'Transaction added', tone: 'success', action: { label: 'Undo', run: () => void undoLast() } });

    if (addAnother) {
      setDraft((d) => ({ ...d, description: '', amount: '', notes: '', tags: [] }));
      setTouched(false);
      return;
    }
    close();
  };

  const makeRule = async () => {
    if (!editing || !draft.category) return;
    const rule = ruleFromTransaction(editing, draft.category);
    await updateConfig({ rules: [...config.rules, rule] });
    toast({ message: `Rule created: ${rule.name}`, tone: 'success' });
  };

  const symbol = currencySymbol(settings.currency, settings.locale);

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title={isEdit ? 'Edit transaction' : 'Add transaction'}
        description={isEdit && editing?.source === 'sheet' ? 'This row came from your Sheet — changes are written back to it.' : undefined}
        footer={
          <>
            {isEdit && (
              <Button variant="ghost" className="mr-auto text-critical" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            {!isEdit && (
              <Button variant="ghost" onClick={() => void submit(true)}>
                Save &amp; add another
              </Button>
            )}
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit(false)}>
              {isEdit ? 'Save changes' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Segmented
            value={draft.type}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
            className="w-full [&>button]:flex-1"
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />

          <div>
            <Label htmlFor="tx-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-medium text-muted">
                {symbol}
              </span>
              <input
                id="tx-amount"
                data-autofocus
                inputMode="decimal"
                autoComplete="off"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                onBlur={() => setTouched(true)}
                placeholder="0.00"
                className="field h-14 pl-10 text-2xl font-semibold tnum"
                aria-invalid={!!amountError}
              />
            </div>
            {amountError && <p className="mt-1 text-[12px] text-critical">{amountError}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tx-desc">Description</Label>
              <Input
                id="tx-desc"
                value={draft.description}
                invalid={!!descError}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                onBlur={(e) => {
                  setTouched(true);
                  // Tidy a pasted statement line, but never fight manual typing.
                  const tidy = prettyMerchant(e.target.value);
                  if (tidy && tidy !== e.target.value && e.target.value === e.target.value.toUpperCase()) {
                    setDraft((d) => ({ ...d, description: tidy }));
                  }
                }}
                placeholder="Where did it go?"
              />
              {descError && <p className="mt-1 text-[12px] text-critical">{descError}</p>}
            </div>
            <div>
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={draft.date}
                max={todayISO()}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value || todayISO() }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tx-cat" hint={isEdit && draft.category ? (
                <button type="button" onClick={() => void makeRule()} className="inline-flex items-center gap-1 text-accent hover:underline">
                  <Wand2 className="h-3 w-3" /> always
                </button>
              ) : undefined}>
                Category
              </Label>
              <CategoryPicker
                value={draft.category}
                onChange={(category) => setDraft((d) => ({ ...d, category }))}
                categories={config.categories}
              />
            </div>
            <div>
              <Label htmlFor="tx-acct">Card / account</Label>
              <Select
                id="tx-acct"
                value={draft.account}
                onChange={(e) => setDraft((d) => ({ ...d, account: e.target.value }))}
              >
                <option value="">Not set</option>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="tx-member">Who</Label>
            <div className="flex flex-wrap gap-1.5">
              {settings.members.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, member: d.member === m ? '' : m }))}
                  className={`chip ${draft.member === m ? 'chip-on' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Tags</Label>
            <TagInput
              value={draft.tags}
              onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
              suggestions={tagSuggestions}
            />
          </div>

          <div>
            <Label htmlFor="tx-notes">Notes</Label>
            <Textarea
              id="tx-notes"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Anything worth remembering later"
            />
          </div>

          <div className="divide-y divide-hairline rounded-xl border border-hairline px-3">
            <Switch
              checked={draft.excluded}
              onChange={(excluded) => setDraft((d) => ({ ...d, excluded }))}
              label="Exclude from reports"
              description="Keeps the row in the list but out of budgets, totals and charts."
            />
            <Switch
              checked={draft.cleared}
              onChange={(cleared) => setDraft((d) => ({ ...d, cleared }))}
              label="Reconciled"
              description="You've checked this against the real statement."
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!editing) return;
          void deleteTransactions([editing.id]);
          toast({
            message: 'Transaction deleted',
            tone: 'info',
            action: { label: 'Undo', run: () => void undoLast() },
          });
          close();
        }}
        title="Delete this transaction?"
        body={
          settings.archiveOnDelete
            ? 'It will be moved to an Archive tab in your Google Sheet, so you can still get it back later.'
            : 'This removes the row from your Google Sheet. You can undo straight away, but not after you close the app.'
        }
      />
    </>
  );
}

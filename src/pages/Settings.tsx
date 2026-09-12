import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  ExternalLink,
  Link2Off,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, Divider, EmptyState } from '@/components/ui/Misc';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Input, Label, Segmented, Select, Switch } from '@/components/ui/Field';
import { ImportDialog } from '@/components/ImportDialog';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { COMMON_CURRENCIES, COMMON_LOCALES, DEFAULT_CATEGORIES, slotColor } from '@/lib/defaults';
import { allAccounts } from '@/lib/analytics';
import { downloadFile, transactionsToCSV } from '@/lib/csv';
import { money, pluralize } from '@/lib/format';
import { timeAgo, todayISO } from '@/lib/dates';
import { makeId } from '@/lib/id';
import type { Category, CategoryGroup } from '@/lib/types';

export function Settings() {
  const { config, updateConfig, transactions, meta, mode, connection, disconnect, refresh, toast, syncing } = useStore();
  const { theme, setTheme, resetPeriod } = useUI();
  const navigate = useNavigate();
  const s = config.settings;

  const [importOpen, setImportOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);

  const detectedAccounts = useMemo(() => allAccounts(transactions), [transactions]);

  const set = (patch: Partial<typeof s>) => updateConfig({ settings: { ...s, ...patch } });

  const usedCategoryNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    return counts;
  }, [transactions]);

  const saveCategory = async (c: Category) => {
    const exists = config.categories.some((x) => x.id === c.id);
    await updateConfig({
      categories: exists ? config.categories.map((x) => (x.id === c.id ? c : x)) : [...config.categories, c],
    });
    setEditingCategory(null);
    setCreatingCategory(false);
  };

  return (
    <div className="space-y-4">
      {/* Connection */}
      <Card>
        <CardHeader
          title="Data source"
          subtitle={mode === 'demo' ? 'You are exploring sample data' : meta?.spreadsheetName ?? 'Google Sheets'}
          action={
            <Button size="sm" variant="secondary" loading={syncing} onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-3 pt-3 text-[13.5px]">
          {mode === 'demo' ? (
            <>
              <p className="leading-relaxed text-ink-2">
                Nothing you change here is saved to a spreadsheet. Connect your own Google Sheet to use the app for
                real — your sample edits stay behind.
              </p>
              <Button variant="primary" onClick={() => navigate('/connect')}>
                Connect a Google Sheet
              </Button>
            </>
          ) : (
            <>
              <dl className="grid gap-y-2 text-[13px] sm:grid-cols-[150px_1fr]">
                <dt className="text-muted">Spreadsheet</dt>
                <dd className="truncate font-medium">{meta?.spreadsheetName ?? '—'}</dd>
                <dt className="text-muted">Tab</dt>
                <dd className="truncate font-medium">{meta?.sheetName ?? '—'}</dd>
                <dt className="text-muted">Rows</dt>
                <dd className="font-medium tnum">{(meta?.rowCount ?? transactions.length).toLocaleString(s.locale)}</dd>
                <dt className="text-muted">Last synced</dt>
                <dd className="font-medium">{meta?.lastSyncedAt ? timeAgo(Date.parse(meta.lastSyncedAt)) : '—'}</dd>
              </dl>
              <Divider />
              <div className="flex flex-wrap gap-2">
                {connection.url && (
                  <a
                    href={connection.url.replace(/\/exec.*$/, '')}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:bg-raised"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open the script
                  </a>
                )}
                <Button variant="secondary" onClick={() => navigate('/connect')}>
                  Change connection
                </Button>
                <Button variant="ghost" className="text-critical" onClick={() => setConfirmDisconnect(true)}>
                  <Link2Off className="h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Money & display */}
      <Card>
        <CardHeader title="Money &amp; display" subtitle="How numbers and dates are shown" />
        <CardBody className="space-y-4 pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-cur">Currency</Label>
              <Select id="s-cur" value={s.currency} onChange={(e) => void set({ currency: e.target.value })}>
                {[...new Set([s.currency, ...COMMON_CURRENCIES])].map((c) => (
                  <option key={c} value={c}>
                    {c} · {money(0, { currency: c, locale: s.locale }, { decimals: 0 }).replace(/[\d.,\s]/g, '') || c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-loc">Language &amp; number format</Label>
              <Select id="s-loc" value={s.locale} onChange={(e) => void set({ locale: e.target.value })}>
                {[...new Set([s.locale, ...COMMON_LOCALES.map((l) => l.id)])].map((id) => (
                  <option key={id} value={id}>
                    {COMMON_LOCALES.find((l) => l.id === id)?.label ?? id}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-start" hint="for salary cycles">
                Month starts on day
              </Label>
              <Select
                id="s-start"
                value={String(s.monthStartDay)}
                onChange={(e) => {
                  const day = Number(e.target.value);
                  void set({ monthStartDay: day });
                  resetPeriod(day);
                }}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d === 1 ? '1st — calendar months' : `${d}${ordinal(d)}`}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-week">Week starts on</Label>
              <Select
                id="s-week"
                value={String(s.weekStart)}
                onChange={(e) => void set({ weekStart: Number(e.target.value) as 0 | 1 | 6 })}
              >
                <option value="1">Monday</option>
                <option value="0">Sunday</option>
                <option value="6">Saturday</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="s-large" hint="marks big charges">
                Large transaction threshold
              </Label>
              <Input
                id="s-large"
                inputMode="decimal"
                value={String(s.largeAmount)}
                onChange={(e) => void set({ largeAmount: Number(e.target.value) || 0 })}
                className="tnum"
              />
            </div>
            <div>
              <Label>Theme</Label>
              <Segmented
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'system', label: 'Auto' },
                ]}
                className="w-full [&>button]:flex-1"
              />
            </div>
          </div>

          <div className="divide-y divide-hairline rounded-xl border border-hairline px-3">
            <Switch
              checked={s.archiveOnDelete}
              onChange={(archiveOnDelete) => void set({ archiveOnDelete })}
              label="Archive instead of deleting"
              description="Deleted rows move to an Archive tab in your Sheet so nothing is lost for good."
            />
            <Switch
              checked={s.pollSeconds > 0}
              onChange={(on) => void set({ pollSeconds: on ? 120 : 0 })}
              label="Check the Sheet automatically"
              description="Checks for new rows every couple of minutes while the app is open, so both of you see the same numbers."
            />
          </div>
        </CardBody>
      </Card>

      {/* People and accounts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Who's spending" subtitle="Used for the split on the overview" />
          <CardBody className="pt-3">
            <ListEditor
              items={s.members}
              onChange={(members) => void set({ members })}
              placeholder="Add a name"
              emptyHint="Add yourself and your partner."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cards &amp; accounts"
            subtitle={detectedAccounts.length ? `${detectedAccounts.length} found in your data` : undefined}
          />
          <CardBody className="pt-3">
            <ListEditor
              items={s.accounts}
              onChange={(accounts) => void set({ accounts })}
              placeholder="Add a card or account"
              suggestions={detectedAccounts.filter((a) => !s.accounts.includes(a))}
              emptyHint="Names here appear in the transaction form."
            />
          </CardBody>
        </Card>
      </div>

      {/* Categories */}
      <Card>
        <CardHeader
          title="Categories"
          subtitle={`${config.categories.filter((c) => !c.hidden).length} in use`}
          action={
            <Button size="sm" variant="secondary" onClick={() => setCreatingCategory(true)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          }
        />
        <CardBody className="pt-3">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {config.categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEditingCategory(c)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-hairline px-3 py-2 text-left transition-colors hover:bg-raised"
                >
                  <span aria-hidden>{c.icon}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slotColor(c.slot) }} />
                  <span className={`min-w-0 flex-1 truncate text-[13.5px] ${c.hidden ? 'text-muted line-through' : ''}`}>
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[11.5px] tnum text-muted">{usedCategoryNames.get(c.name) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
          {config.categories.length === 0 && (
            <EmptyState
              title="No categories"
              body="Restore the defaults to get a sensible starting set."
              action={
                <Button variant="secondary" onClick={() => void updateConfig({ categories: DEFAULT_CATEGORIES })}>
                  Restore defaults
                </Button>
              }
            />
          )}
        </CardBody>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader title="Your data" subtitle="It lives in your Google Sheet — this app never stores it anywhere else" />
        <CardBody className="flex flex-wrap gap-2 pt-3">
          <Button
            variant="secondary"
            onClick={() => {
              downloadFile(`ledgerly-all-${todayISO()}.csv`, transactionsToCSV(transactions));
              toast({ message: `Exported ${pluralize(transactions.length, 'row')}`, tone: 'success' });
            }}
          >
            <Download className="h-4 w-4" />
            Export everything
          </Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import a CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              downloadFile(
                `ledgerly-settings-${todayISO()}.json`,
                JSON.stringify({ settings: s, categories: config.categories, budgets: config.budgets, goals: config.goals, rules: config.rules }, null, 2),
                'application/json',
              );
              toast({ message: 'Settings exported', tone: 'success' });
            }}
          >
            <Download className="h-4 w-4" />
            Export settings
          </Button>
        </CardBody>
      </Card>

      <p className="px-1 pb-4 text-center text-[12px] text-muted">
        Ledgerly · your numbers stay in your spreadsheet
      </p>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <CategoryEditor
        open={creatingCategory || editingCategory != null}
        category={editingCategory}
        usageCount={editingCategory ? (usedCategoryNames.get(editingCategory.name) ?? 0) : 0}
        onClose={() => {
          setEditingCategory(null);
          setCreatingCategory(false);
        }}
        onSave={saveCategory}
        onDelete={(c) => {
          void updateConfig({ categories: config.categories.filter((x) => x.id !== c.id) });
          setEditingCategory(null);
        }}
      />

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          disconnect();
          navigate('/connect');
        }}
        title="Disconnect this Sheet?"
        body="Your spreadsheet is untouched. This device forgets the connection and the cached copy, and you'll need the web app URL again to reconnect."
        confirmLabel="Disconnect"
      />
    </div>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

function ListEditor({
  items,
  onChange,
  placeholder,
  suggestions = [],
  emptyHint,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  emptyHint?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = (value: string) => {
    const v = value.trim();
    if (!v || items.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  };

  return (
    <div>
      {items.length > 0 ? (
        <ul className="mb-2.5 space-y-1.5">
          {items.map((item, i) => (
            <li key={item} className="flex items-center gap-2 rounded-lg border border-hairline px-2.5 py-2">
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{item}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, x) => x !== i))}
                aria-label={`Remove ${item}`}
                className="shrink-0 rounded p-1 text-muted hover:text-critical"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        emptyHint && <p className="mb-2.5 text-[13px] text-muted">{emptyHint}</p>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
        />
        <Button variant="secondary" onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 8).map((sg) => (
            <button key={sg} type="button" onClick={() => add(sg)} className="chip hover:border-accent/40 hover:text-accent">
              + {sg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const GROUPS: { value: CategoryGroup; label: string }[] = [
  { value: 'needs', label: 'Essential' },
  { value: 'wants', label: 'Lifestyle' },
  { value: 'savings', label: 'Saving' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

function CategoryEditor({
  open,
  category,
  usageCount,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  category: Category | null;
  usageCount: number;
  onClose: () => void;
  onSave: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? '🏷️');
  const [group, setGroup] = useState<CategoryGroup>(category?.group ?? 'wants');
  const [slot, setSlot] = useState(category?.slot ?? 1);
  const [hidden, setHidden] = useState(category?.hidden ?? false);

  const key = `${open}-${category?.id ?? 'new'}`;
  const [seeded, setSeeded] = useState(key);
  if (seeded !== key) {
    setSeeded(key);
    setName(category?.name ?? '');
    setIcon(category?.icon ?? '🏷️');
    setGroup(category?.group ?? 'wants');
    setSlot(category?.slot ?? 1);
    setHidden(category?.hidden ?? false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      size="sm"
      footer={
        <>
          {category && (
            <Button
              variant="ghost"
              className="mr-auto text-critical"
              disabled={usageCount > 0}
              title={usageCount > 0 ? `In use by ${pluralize(usageCount, 'transaction')} — hide it instead` : undefined}
              onClick={() => onDelete(category)}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                id: category?.id ?? makeId('cat'),
                name: name.trim(),
                icon: icon || '🏷️',
                group,
                slot,
                hidden,
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[72px_1fr] gap-3">
          <div>
            <Label htmlFor="c-icon">Icon</Label>
            <Input
              id="c-icon"
              value={icon}
              onChange={(e) => setIcon([...e.target.value].slice(-2).join(''))}
              className="text-center text-xl"
            />
          </div>
          <div>
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="c-group">Group</Label>
          <Select id="c-group" value={group} onChange={(e) => setGroup(e.target.value as CategoryGroup)}>
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label hint="from the chart palette">Colour</Label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Colour ${n}`}
                aria-pressed={slot === n}
                onClick={() => setSlot(n)}
                className="h-8 w-8 rounded-lg transition-transform hover:scale-105"
                style={{
                  background: slotColor(n),
                  boxShadow: slot === n ? '0 0 0 2px rgb(var(--surface)), 0 0 0 4px rgb(var(--ink))' : undefined,
                }}
              />
            ))}
          </div>
        </div>

        {category && (
          <div className="rounded-xl border border-hairline px-3">
            <Switch
              checked={hidden}
              onChange={setHidden}
              label="Hide from pickers"
              description={
                usageCount > 0
                  ? `Used by ${pluralize(usageCount, 'transaction')}, which keep this category.`
                  : 'Keeps it out of the way without deleting it.'
              }
            />
          </div>
        )}

        {usageCount > 0 && <Badge tone="neutral">{pluralize(usageCount, 'transaction')} use this</Badge>}
      </div>
    </Modal>
  );
}

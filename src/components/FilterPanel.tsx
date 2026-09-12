import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Segmented } from '@/components/ui/Field';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { allAccounts, allTags, filterCount } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import type { TxnType } from '@/lib/types';

export function FilterPanel() {
  const { filtersOpen, setFiltersOpen, filter, setFilter, clearFilter } = useUI();
  const { transactions, config } = useStore();

  const accounts = useMemo(
    () => [...new Set([...config.settings.accounts, ...allAccounts(transactions)])].filter(Boolean),
    [config.settings.accounts, transactions],
  );
  const tags = useMemo(() => allTags(transactions), [transactions]);
  const catNames = useMemo(
    () => config.categories.filter((c) => !c.hidden).map((c) => c.name),
    [config.categories],
  );

  const toggle = (key: 'categories' | 'accounts' | 'members' | 'tags', value: string) => {
    const cur = filter[key];
    setFilter({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] } as never);
  };

  const toggleType = (t: TxnType) =>
    setFilter({ types: filter.types.includes(t) ? filter.types.filter((v) => v !== t) : [...filter.types, t] });

  const n = filterCount(filter);

  return (
    <Modal
      open={filtersOpen}
      onClose={() => setFiltersOpen(false)}
      title="Filters"
      description={n ? `${n} active` : 'Narrow the list down'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={clearFilter} disabled={!n}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button variant="primary" onClick={() => setFiltersOpen(false)}>
            Show results
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Type</Label>
          <div className="flex flex-wrap gap-1.5">
            {(['expense', 'income', 'transfer'] as TxnType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={cn('chip capitalize', filter.types.includes(t) && 'chip-on')}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-min">Minimum amount</Label>
            <Input
              id="f-min"
              inputMode="decimal"
              value={filter.min ?? ''}
              placeholder="Any"
              onChange={(e) => setFilter({ min: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="f-max">Maximum amount</Label>
            <Input
              id="f-max"
              inputMode="decimal"
              value={filter.max ?? ''}
              placeholder="Any"
              onChange={(e) => setFilter({ max: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <Label>Categories</Label>
          <div className="flex flex-wrap gap-1.5">
            {catNames.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle('categories', c)}
                className={cn('chip', filter.categories.includes(c) && 'chip-on')}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {accounts.length > 0 && (
          <div>
            <Label>Cards &amp; accounts</Label>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggle('accounts', a)}
                  className={cn('chip', filter.accounts.includes(a) && 'chip-on')}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {config.settings.members.length > 0 && (
          <div>
            <Label>Who</Label>
            <div className="flex flex-wrap gap-1.5">
              {config.settings.members.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggle('members', m)}
                  className={cn('chip', filter.members.includes(m) && 'chip-on')}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.slice(0, 24).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle('tags', t)}
                  className={cn('chip', filter.tags.includes(t) && 'chip-on')}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Excluded rows</Label>
            <Segmented
              value={filter.excluded}
              onChange={(excluded) => setFilter({ excluded })}
              options={[
                { value: 'any', label: 'Show all' },
                { value: 'hide', label: 'Hide' },
                { value: 'only', label: 'Only these' },
              ]}
            />
          </div>
          <div>
            <Label>Categorization</Label>
            <Segmented
              value={filter.uncategorizedOnly ? 'todo' : 'all'}
              onChange={(v) => setFilter({ uncategorizedOnly: v === 'todo' })}
              options={[
                { value: 'all', label: 'All rows' },
                { value: 'todo', label: 'Needs a category' },
              ]}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

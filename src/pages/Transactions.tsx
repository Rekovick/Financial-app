import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, CheckSquare, Download, Search, SlidersHorizontal, Upload, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Misc';
import { MenuDivider, MenuItem, Popover } from '@/components/ui/Popover';
import { TransactionList } from '@/components/TransactionList';
import { FilterPanel } from '@/components/FilterPanel';
import { ImportDialog } from '@/components/ImportDialog';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { applyFilter, filterCount, sortTxns, totals } from '@/lib/analytics';
import { downloadFile, transactionsToCSV } from '@/lib/csv';
import { money, pluralize } from '@/lib/format';
import { inRange, todayISO } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Sort, SortKey } from '@/lib/types';

const SORTS: { key: SortKey; dir: Sort['dir']; label: string }[] = [
  { key: 'date', dir: 'desc', label: 'Newest first' },
  { key: 'date', dir: 'asc', label: 'Oldest first' },
  { key: 'amount', dir: 'desc', label: 'Largest amount' },
  { key: 'amount', dir: 'asc', label: 'Smallest amount' },
  { key: 'description', dir: 'asc', label: 'Description A–Z' },
  { key: 'category', dir: 'asc', label: 'Category A–Z' },
];

export function Transactions() {
  const { transactions, config, toast } = useStore();
  const { range, filter, setFilter, clearFilter, sort, setSort, setFiltersOpen, selection, selectMany, clearSelection } =
    useUI();
  const [importOpen, setImportOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const s = config.settings;

  // The page always respects the global period unless the filter overrides it.
  const scoped = useMemo(
    () => (filter.range ? transactions : transactions.filter((t) => inRange(t.date, range))),
    [transactions, filter.range, range],
  );

  const results = useMemo(() => sortTxns(applyFilter(scoped, filter), sort), [scoped, filter, sort]);
  const sums = useMemo(() => totals(results), [results]);
  const activeFilters = filterCount(filter);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && selection.length) clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.length, clearSelection]);

  const allSelected = results.length > 0 && selection.length === results.length;
  const sortLabel = SORTS.find((x) => x.key === sort.key && x.dir === sort.dir)?.label ?? 'Custom';

  return (
    <div className="space-y-3">
      {/* One row of controls above the list. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            value={filter.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            placeholder="Search description, notes, tags…"
            className="field pl-9 pr-9"
            type="search"
          />
          {filter.search && (
            <button
              type="button"
              onClick={() => setFilter({ search: '' })}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button variant={activeFilters ? 'primary' : 'secondary'} onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilters > 0 && (
            <span className="ml-0.5 rounded-full bg-white/25 px-1.5 text-[11px] font-semibold">{activeFilters}</span>
          )}
        </Button>

        <Popover
          width={220}
          align="end"
          trigger={({ toggle, ref }) => (
            <Button variant="secondary" ref={ref as never} onClick={toggle}>
              <ArrowDownUp className="h-4 w-4" />
              <span className="hidden sm:inline">{sortLabel}</span>
            </Button>
          )}
        >
          {(close) => (
            <div className="py-1">
              {SORTS.map((o) => (
                <MenuItem
                  key={`${o.key}-${o.dir}`}
                  onClick={() => {
                    setSort({ key: o.key, dir: o.dir });
                    close();
                  }}
                >
                  {o.label}
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <Popover
          width={230}
          align="end"
          trigger={({ toggle, ref }) => (
            <Button variant="secondary" size="icon" ref={ref as never} onClick={toggle} aria-label="More actions">
              ⋯
            </Button>
          )}
        >
          {(close) => (
            <div className="py-1">
              <MenuItem
                icon={<CheckSquare className="h-4 w-4" />}
                onClick={() => {
                  allSelected ? clearSelection() : selectMany(results.map((t) => t.id));
                  close();
                }}
              >
                {allSelected ? 'Clear selection' : `Select all ${results.length}`}
              </MenuItem>
              <MenuDivider />
              <MenuItem
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  downloadFile(`ledgerly-${todayISO()}.csv`, transactionsToCSV(results));
                  toast({ message: `Exported ${pluralize(results.length, 'row')}`, tone: 'success' });
                  close();
                }}
              >
                Export these as CSV
              </MenuItem>
              <MenuItem
                icon={<Upload className="h-4 w-4" />}
                onClick={() => {
                  setImportOpen(true);
                  close();
                }}
              >
                Import from CSV
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>

      {/* Result summary — the honest answer to "what am I looking at". */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12.5px] text-muted">
        <span>
          <span className="font-semibold text-ink">{results.length.toLocaleString(s.locale)}</span> of{' '}
          {scoped.length.toLocaleString(s.locale)} rows
        </span>
        <span className="redact">
          out <span className="font-semibold tnum text-ink">{money(sums.expense, s, { compact: true })}</span>
        </span>
        <span className="redact">
          in <span className="font-semibold tnum text-[rgb(var(--inflow))]">{money(sums.income, s, { compact: true })}</span>
        </span>
        {activeFilters > 0 && (
          <button type="button" onClick={clearFilter} className="font-medium text-accent hover:underline">
            Clear filters
          </button>
        )}
        {filter.range && (
          <Badge tone="accent">
            Filter dates override the period
          </Badge>
        )}
      </div>

      <Card className={cn('clip-round', selection.length && 'pb-2')}>
        <TransactionList
          transactions={results}
          emptyTitle={activeFilters ? 'No rows match those filters' : 'No transactions in this period'}
          emptyBody={
            activeFilters
              ? 'Try widening the filters, or clear them to see everything in this period.'
              : 'Change the period at the top, or add a transaction.'
          }
          emptyAction={
            activeFilters ? (
              <Button variant="secondary" onClick={clearFilter}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </Card>

      <FilterPanel />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

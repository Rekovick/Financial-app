import { Fragment, useEffect, useMemo, useState } from 'react';
import { Receipt } from 'lucide-react';
import { TransactionRow } from './TransactionRow';
import { EmptyState } from '@/components/ui/Misc';
import { Button } from '@/components/ui/Button';
import { groupByDay } from '@/lib/analytics';
import { money } from '@/lib/format';
import { relativeDayLabel } from '@/lib/dates';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import type { Transaction } from '@/lib/types';

const PAGE = 60;

/**
 * Day-grouped list with incremental rendering. A household ledger can hold tens
 * of thousands of rows; only what's on screen (plus a page) is ever mounted.
 */
export function TransactionList({
  transactions,
  emptyTitle = 'Nothing here yet',
  emptyBody,
  emptyAction,
  showDayTotals = true,
}: {
  transactions: Transaction[];
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  showDayTotals?: boolean;
}) {
  const { config } = useStore();
  const { selection, toggleSelected, setEditing } = useUI();
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => setLimit(PAGE), [transactions.length]);

  const days = useMemo(() => groupByDay(transactions.slice(0, limit)), [transactions, limit]);
  const selectMode = selection.length > 0;
  const hasMore = transactions.length > limit;

  if (!transactions.length) {
    return <EmptyState icon={<Receipt className="h-5 w-5" />} title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  return (
    <div>
      {days.map((day) => (
        <Fragment key={day.date}>
          <div className="sticky top-[52px] z-10 flex items-baseline justify-between gap-3 border-y border-hairline bg-raised/95 px-3 py-1.5 backdrop-blur-sm sm:px-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {relativeDayLabel(day.date, config.settings.locale)}
            </span>
            {showDayTotals && (
              <span className="redact text-[11px] font-medium tnum text-muted">
                {day.total >= 0 ? '+' : '−'}
                {money(Math.abs(day.total), config.settings)}
              </span>
            )}
          </div>
          <ul className="divide-y divide-hairline">
            {day.items.map((t) => (
              <li key={t.id}>
                <TransactionRow
                  txn={t}
                  settings={config.settings}
                  categories={config.categories}
                  selected={selection.includes(t.id)}
                  selectMode={selectMode}
                  onOpen={setEditing}
                  onToggleSelect={toggleSelected}
                />
              </li>
            ))}
          </ul>
        </Fragment>
      ))}

      {hasMore && (
        <div className="flex justify-center border-t border-hairline p-4">
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE * 2)}>
            Show more ({transactions.length - limit} left)
          </Button>
        </div>
      )}
    </div>
  );
}

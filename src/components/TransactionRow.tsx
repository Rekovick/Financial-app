import { memo } from 'react';
import { CircleCheck, EyeOff, Paperclip } from 'lucide-react';
import { cn } from '@/lib/cn';
import { money, prettyMerchant } from '@/lib/format';
import { categoryColor, categoryIcon } from '@/lib/defaults';
import type { Category, Settings, Transaction } from '@/lib/types';

export const TransactionRow = memo(function TransactionRow({
  txn,
  settings,
  categories,
  selected,
  selectMode,
  onOpen,
  onToggleSelect,
  showAccount = true,
}: {
  txn: Transaction;
  settings: Settings;
  categories: Category[];
  selected: boolean;
  selectMode: boolean;
  onOpen: (t: Transaction) => void;
  onToggleSelect: (id: string, additive: boolean) => void;
  showAccount?: boolean;
}) {
  const isIncome = txn.type === 'income';
  const isTransfer = txn.type === 'transfer';
  const large = txn.type === 'expense' && txn.amount >= settings.largeAmount;

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-4',
        selected ? 'bg-accent-soft' : 'hover:bg-raised',
      )}
    >
      <button
        type="button"
        aria-label={selected ? 'Deselect' : 'Select'}
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(txn.id, true);
        }}
        className={cn(
          'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base transition-all',
          selected ? 'bg-accent text-white' : 'bg-hairline',
        )}
        style={selected ? undefined : { boxShadow: `inset 0 0 0 1.5px ${categoryColor(categories, txn.category)}22` }}
      >
        {selected ? (
          <CircleCheck className="h-[18px] w-[18px]" strokeWidth={2.4} />
        ) : (
          <span aria-hidden>{categoryIcon(categories, txn.category)}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => (selectMode ? onToggleSelect(txn.id, true) : onOpen(txn))}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('truncate text-[14.5px] font-medium', txn.excluded ? 'text-muted line-through' : 'text-ink')}>
              {prettyMerchant(txn.description) || 'Transaction'}
            </span>
            {txn.excluded && <EyeOff className="h-3 w-3 shrink-0 text-muted" aria-label="Excluded from reports" />}
            {txn.notes && <Paperclip className="h-3 w-3 shrink-0 text-muted" aria-label="Has notes" />}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: categoryColor(categories, txn.category) }}
              aria-hidden
            />
            <span className="truncate">{txn.category || 'Uncategorized'}</span>
            {showAccount && txn.account && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{txn.account}</span>
              </>
            )}
            {txn.member && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{txn.member}</span>
              </>
            )}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span
            className={cn(
              'redact block text-[14.5px] font-semibold tnum',
              isIncome ? 'text-[rgb(var(--inflow))]' : isTransfer ? 'text-muted' : 'text-ink',
            )}
          >
            {isIncome ? '+' : isTransfer ? '' : '−'}
            {money(txn.amount, settings)}
          </span>
          {(large || txn.cleared || txn.tags.length > 0) && (
            <span className="mt-0.5 flex items-center justify-end gap-1">
              {txn.tags.slice(0, 2).map((t) => (
                <span key={t} className="rounded bg-hairline px-1 py-px text-[10px] font-medium text-muted">
                  {t}
                </span>
              ))}
              {txn.cleared && <CircleCheck className="h-3 w-3 text-good" aria-label="Reconciled" />}
              {large && !txn.cleared && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">large</span>
              )}
            </span>
          )}
        </span>
      </button>
    </div>
  );
});

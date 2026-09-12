import { useState } from 'react';
import { EyeOff, Tag, Trash2, User, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Popover } from '@/components/ui/Popover';
import { CategoryPicker } from './CategoryPicker';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { money, pluralize } from '@/lib/format';
import { signed } from '@/lib/analytics';

/** Appears only when rows are selected. Every action here is undoable. */
export function BulkBar() {
  const { selection, clearSelection } = useUI();
  const { transactions, config, saveTransactions, deleteTransactions, toast, undoLast } = useStore();
  const [confirm, setConfirm] = useState(false);

  if (!selection.length) return null;

  const rows = transactions.filter((t) => selection.includes(t.id));
  const net = rows.reduce((s, t) => s + signed(t), 0);

  const patchAll = async (patch: Partial<(typeof rows)[number]>, label: string) => {
    await saveTransactions(
      rows.map((t) => ({ ...t, ...patch })),
      { label },
    );
    toast({
      message: `${label} · ${pluralize(rows.length, 'transaction')}`,
      tone: 'success',
      action: { label: 'Undo', run: () => void undoLast() },
    });
    clearSelection();
  };

  return createPortal(
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-5 sm:pb-5"
        style={{ paddingBottom: 'calc(var(--safe-b) + 72px)' }}
      >
        <div className="mx-auto flex max-w-3xl animate-slide-up items-center gap-1.5 rounded-2xl border border-hairline bg-surface p-2 shadow-pop">
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-hairline hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mr-auto min-w-0 pl-0.5">
            <p className="text-[13px] font-semibold leading-tight">{pluralize(rows.length, 'row')}</p>
            <p className="redact text-[11px] tnum text-muted">
              net {net >= 0 ? '+' : '−'}
              {money(Math.abs(net), config.settings)}
            </p>
          </div>

          <Popover
            width={280}
            align="end"
            trigger={({ toggle, ref }) => (
              <button
                type="button"
                ref={ref as never}
                onClick={toggle}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-hairline"
              >
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">Categorize</span>
              </button>
            )}
          >
            {(close) => (
              <div className="p-3">
                <p className="label">Set category for {rows.length}</p>
                <CategoryPicker
                  value=""
                  categories={config.categories}
                  placeholder="Pick a category"
                  onChange={(category) => {
                    void patchAll({ category }, `Set category to ${category}`);
                    close();
                  }}
                />
              </div>
            )}
          </Popover>

          <Popover
            width={220}
            align="end"
            trigger={({ toggle, ref }) => (
              <button
                type="button"
                ref={ref as never}
                onClick={toggle}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-hairline"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Who</span>
              </button>
            )}
          >
            {(close) => (
              <div className="py-1">
                {config.settings.members.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      void patchAll({ member: m }, `Assign to ${m}`);
                      close();
                    }}
                    className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-hairline"
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </Popover>

          <button
            type="button"
            onClick={() => void patchAll({ excluded: !rows.every((r) => r.excluded) }, rows.every((r) => r.excluded) ? 'Include in reports' : 'Exclude from reports')}
            title="Toggle exclude from reports"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-hairline"
          >
            <EyeOff className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label="Delete selected"
            className="rounded-lg p-2 text-critical transition-colors hover:bg-critical/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          void deleteTransactions(selection);
          toast({
            message: `Deleted ${pluralize(selection.length, 'transaction')}`,
            tone: 'info',
            action: { label: 'Undo', run: () => void undoLast() },
          });
          clearSelection();
        }}
        title={`Delete ${pluralize(rows.length, 'transaction')}?`}
        body={
          config.settings.archiveOnDelete
            ? 'They move to an Archive tab in your Google Sheet and can be restored from there.'
            : 'These rows are removed from your Google Sheet. Undo works until you close the app.'
        }
      />
    </>,
    document.body,
  );
}

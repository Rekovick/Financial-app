import { useMemo, useRef, useState } from 'react';
import { FileUp, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Select, Switch } from '@/components/ui/Field';
import { useStore } from '@/lib/store';
import {
  findDuplicates,
  guessMapping,
  parseCSV,
  rowsToTransactions,
  type ImportMapping,
} from '@/lib/csv';
import { makeId } from '@/lib/id';
import { money, pluralize } from '@/lib/format';
import type { Transaction } from '@/lib/types';

const FIELDS: { key: keyof ImportMapping; label: string; required?: boolean }[] = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'amountOut', label: 'Second amount column (credit)' },
  { key: 'type', label: 'Type / direction' },
  { key: 'category', label: 'Category' },
  { key: 'account', label: 'Card / account' },
  { key: 'member', label: 'Who' },
  { key: 'notes', label: 'Notes' },
  { key: 'tags', label: 'Tags' },
];

/** Three steps: pick a file, confirm the column mapping, review before writing. */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { transactions, config, saveTransactions, adoptFromData, toast, undoLast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [preferDMY, setPreferDMY] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = rows?.[0] ?? [];

  const parsed = useMemo(() => {
    if (!rows || !mapping) return null;
    return rowsToTransactions(rows, mapping, {
      hasHeader,
      preferDMY,
      defaultAccount: config.settings.accounts[0],
      defaultMember: config.settings.members[0],
      makeId: () => makeId('imp'),
    });
  }, [rows, mapping, hasHeader, preferDMY, config.settings]);

  const duplicates = useMemo(
    () => (parsed ? findDuplicates(parsed.transactions, transactions) : new Set<string>()),
    [parsed, transactions],
  );

  const toWrite: Transaction[] = useMemo(() => {
    if (!parsed) return [];
    return skipDuplicates ? parsed.transactions.filter((t) => !duplicates.has(t.id)) : parsed.transactions;
  }, [parsed, skipDuplicates, duplicates]);

  const reset = () => {
    setRows(null);
    setMapping(null);
    setFileName('');
  };

  const readFile = async (file: File) => {
    const text = await file.text();
    const parsedRows = parseCSV(text);
    if (!parsedRows.length) {
      toast({ message: 'That file has no readable rows.', tone: 'error' });
      return;
    }
    setRows(parsedRows);
    setFileName(file.name);
    setMapping(guessMapping(parsedRows[0]));
  };

  const commit = async () => {
    if (!toWrite.length) return;
    setBusy(true);
    await saveTransactions(toWrite, { label: `Import ${toWrite.length}` });
    // Adopt whatever taxonomy the file brought with it, so the new rows are
    // coloured and named rather than filed under a grey question mark.
    const adopted = await adoptFromData(parsed?.currency);
    setBusy(false);
    toast({
      message: adopted
        ? `Imported ${pluralize(toWrite.length, 'transaction')} and ${pluralize(adopted, 'category', 'categories')}`
        : `Imported ${pluralize(toWrite.length, 'transaction')}`,
      tone: 'success',
      action: { label: 'Undo', run: () => void undoLast() },
    });
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import transactions"
      description="From a bank export, another app, or a second sheet."
      size="lg"
      footer={
        <>
          {rows && (
            <Button variant="ghost" className="mr-auto" onClick={reset}>
              Choose another file
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" disabled={!toWrite.length} loading={busy} onClick={() => void commit()}>
            {toWrite.length ? `Import ${toWrite.length}` : 'Import'}
          </Button>
        </>
      }
    >
      {!rows ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line py-12 transition-colors hover:border-accent hover:bg-accent-soft/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void readFile(f);
          }}
        >
          <FileUp className="h-6 w-6 text-muted" />
          <span className="text-sm font-medium">Drop a CSV here, or click to choose</span>
          <span className="text-[12.5px] text-muted">Columns are matched automatically — you can correct them next.</span>
        </button>
      ) : (
        <div className="space-y-5">
          <p className="text-[13px] text-muted">
            <span className="font-medium text-ink">{fileName}</span> · {rows.length - (hasHeader ? 1 : 0)} data rows
          </p>

          <div className="divide-y divide-hairline rounded-xl border border-hairline px-3">
            <Switch checked={hasHeader} onChange={setHasHeader} label="First row is a header" />
            <Switch
              checked={preferDMY}
              onChange={setPreferDMY}
              label="Dates are day-first"
              description="Turn on for 04/03/2026 meaning 4 March, not 3 April."
            />
            <Switch
              checked={skipDuplicates}
              onChange={setSkipDuplicates}
              label="Skip rows already in the ledger"
              description={`${duplicates.size} look like duplicates of existing rows.`}
            />
          </div>

          <div>
            <Label>Column mapping</Label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-[12px] text-muted" htmlFor={`map-${f.key}`}>
                    {f.label}
                    {f.required && <span className="text-critical"> *</span>}
                  </label>
                  <Select
                    id={`map-${f.key}`}
                    value={mapping ? String(mapping[f.key]) : '-1'}
                    onChange={(e) => setMapping((m) => (m ? { ...m, [f.key]: Number(e.target.value) } : m))}
                  >
                    <option value="-1">— not in file —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {hasHeader ? h || `Column ${i + 1}` : `Column ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {parsed && parsed.problems.length > 0 && (
            <div className="flex gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="min-w-0 text-[12.5px] leading-relaxed">
                <p className="font-medium">{pluralize(parsed.skipped, 'row')} could not be read and will be skipped.</p>
                <ul className="mt-1 space-y-0.5 text-muted">
                  {parsed.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {toWrite.length > 0 && (
            <div>
              <Label>Preview · first 5 of {toWrite.length}</Label>
              <div className="overflow-x-auto rounded-xl border border-hairline">
                <table className="w-full min-w-[420px] text-[12.5px]">
                  <thead className="bg-raised text-muted">
                    <tr>
                      <th className="px-2.5 py-2 text-left font-medium">Date</th>
                      <th className="px-2.5 py-2 text-left font-medium">Description</th>
                      <th className="px-2.5 py-2 text-left font-medium">Category</th>
                      <th className="px-2.5 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {toWrite.slice(0, 5).map((t) => (
                      <tr key={t.id}>
                        <td className="whitespace-nowrap px-2.5 py-2 tnum">{t.date}</td>
                        <td className="max-w-[180px] truncate px-2.5 py-2">{t.description}</td>
                        <td className="px-2.5 py-2 text-muted">{t.category}</td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right tnum">
                          {t.type === 'income' ? '+' : '−'}
                          {money(t.amount, config.settings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readFile(f);
          e.target.value = '';
        }}
      />
    </Modal>
  );
}

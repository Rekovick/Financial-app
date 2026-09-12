import { coerceDate, todayISO } from './dates';
import { parseAmount } from './format';
import { UNCATEGORIZED } from './defaults';
import type { Transaction, TxnType } from './types';

/** RFC-4180-ish parser: handles quotes, embedded commas/newlines, and BOM. */
export function parseCSV(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = delimiter ?? sniffDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function sniffDelimiter(text: string): string {
  const head = text.split('\n').slice(0, 5).join('\n');
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let quoted = false;
  for (const ch of head) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

export function toCSV(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = cell == null ? '' : String(cell);
          // Guard against spreadsheet formula injection on re-import.
          const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
          return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(','),
    )
    .join('\r\n');
}

export const EXPORT_COLUMNS = [
  'Date',
  'Description',
  'Amount',
  'Type',
  'Category',
  'Account',
  'Member',
  'Tags',
  'Notes',
  'Excluded',
  'Cleared',
  'Id',
] as const;

export function transactionsToCSV(txns: Transaction[]): string {
  const rows: (string | number)[][] = [[...EXPORT_COLUMNS]];
  for (const t of txns) {
    rows.push([
      t.date,
      t.description,
      t.amount.toFixed(2),
      t.type,
      t.category,
      t.account,
      t.member,
      t.tags.join('; '),
      t.notes,
      t.excluded ? 'yes' : '',
      t.cleared ? 'yes' : '',
      t.id,
    ]);
  }
  return toCSV(rows);
}

export function downloadFile(name: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------- CSV import ------------------------------- */

export interface ImportMapping {
  date: number;
  description: number;
  amount: number;
  /** Second column when the file splits debit and credit. -1 when unused. */
  amountOut: number;
  type: number;
  category: number;
  account: number;
  member: number;
  notes: number;
  tags: number;
}

const HEADER_HINTS: Record<keyof ImportMapping, string[]> = {
  date: ['date', 'transaction date', 'posted', 'posting date', 'time', 'when', 'التاريخ'],
  description: ['description', 'merchant', 'name', 'details', 'payee', 'narrative', 'memo', 'reference', 'transaction', 'البيان', 'الوصف'],
  amount: ['amount', 'value', 'total', 'debit', 'charge', 'withdrawal', 'spent', 'المبلغ'],
  amountOut: ['credit', 'deposit', 'income', 'in', 'received'],
  type: ['type', 'direction', 'kind', 'dr/cr', 'debit/credit'],
  category: ['category', 'cat', 'group', 'التصنيف'],
  account: ['account', 'card', 'source', 'bank', 'wallet', 'instrument', 'البطاقة'],
  member: ['member', 'who', 'person', 'user', 'owner', 'paid by'],
  notes: ['notes', 'note', 'comment', 'remarks'],
  tags: ['tags', 'labels'],
};

/** Score-based header matching — tolerant of "Txn Date", "AMOUNT (SAR)", etc. */
export function guessMapping(headers: string[]): ImportMapping {
  const norm = headers.map((h) => h.toLowerCase().replace(/[_\-.]/g, ' ').replace(/\(.*?\)/g, '').trim());
  const used = new Set<number>();

  const pick = (field: keyof ImportMapping): number => {
    const hints = HEADER_HINTS[field];
    let best = -1;
    let bestScore = 0;
    norm.forEach((h, i) => {
      if (used.has(i) || !h) return;
      let score = 0;
      for (const hint of hints) {
        if (h === hint) score = Math.max(score, 100);
        else if (h.startsWith(hint) || h.endsWith(hint)) score = Math.max(score, 70);
        else if (h.includes(hint)) score = Math.max(score, 50);
      }
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= 50) {
      used.add(best);
      return best;
    }
    return -1;
  };

  // Order matters: the most specific fields claim their column first.
  const date = pick('date');
  const description = pick('description');
  const category = pick('category');
  const account = pick('account');
  const member = pick('member');
  const notes = pick('notes');
  const tags = pick('tags');
  const type = pick('type');
  const amount = pick('amount');
  const amountOut = pick('amountOut');

  return { date, description, amount, amountOut, type, category, account, member, notes, tags };
}

export interface ImportResult {
  transactions: Transaction[];
  skipped: number;
  problems: string[];
  /** The ISO code a currency column names, when it names one consistently. */
  currency?: string;
}

export function rowsToTransactions(
  rows: string[][],
  mapping: ImportMapping,
  opts: { hasHeader: boolean; preferDMY?: boolean; defaultAccount?: string; defaultMember?: string; makeId: () => string },
): ImportResult {
  const body = opts.hasHeader ? rows.slice(1) : rows;
  const transactions: Transaction[] = [];
  const problems: string[] = [];
  let skipped = 0;

  // A single amount column with no negatives anywhere and no type column is a
  // pure spend feed — treat it as expenses rather than calling everything income.
  const singleColumnAllPositive =
    mapping.amountOut < 0 &&
    mapping.type < 0 &&
    body.every((r) => {
      const v = parseAmount(String(r[mapping.amount] ?? ''));
      return v == null || v >= 0;
    });

  body.forEach((row, i) => {
    const cell = (idx: number) => (idx >= 0 && idx < row.length ? String(row[idx] ?? '').trim() : '');
    const date = coerceDate(cell(mapping.date), opts.preferDMY);
    if (!date) {
      skipped++;
      if (problems.length < 5) problems.push(`Row ${i + (opts.hasHeader ? 2 : 1)}: unreadable date "${cell(mapping.date)}"`);
      return;
    }

    const primary = parseAmount(cell(mapping.amount));
    const secondary = mapping.amountOut >= 0 ? parseAmount(cell(mapping.amountOut)) : null;

    let value: number | null = null;
    let type: TxnType = 'expense';
    if (secondary != null && secondary !== 0) {
      // Two-column debit/credit layout: the second column is always money in.
      value = Math.abs(secondary);
      type = 'income';
    } else if (primary != null && primary !== 0) {
      value = Math.abs(primary);
      // Signed single column: negative is money out. All-positive feeds are spend.
      type = singleColumnAllPositive || primary < 0 ? 'expense' : mapping.amountOut >= 0 ? 'expense' : 'income';
    }

    if (value == null) {
      skipped++;
      if (problems.length < 5) problems.push(`Row ${i + (opts.hasHeader ? 2 : 1)}: unreadable amount "${cell(mapping.amount)}"`);
      return;
    }

    const typeCell = cell(mapping.type);
    if (typeCell) {
      if (looksLikeIncome(typeCell)) type = 'income';
      else if (/transfer|tfr|move/i.test(typeCell)) type = 'transfer';
      else type = 'expense';
    }

    transactions.push({
      id: opts.makeId(),
      date,
      description: cell(mapping.description) || 'Transaction',
      amount: Math.abs(value),
      type,
      category: cell(mapping.category) || UNCATEGORIZED,
      account: cell(mapping.account) || opts.defaultAccount || '',
      member: cell(mapping.member) || opts.defaultMember || '',
      notes: cell(mapping.notes),
      tags: cell(mapping.tags)
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      excluded: false,
      cleared: false,
      source: 'app',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  return { transactions, skipped, problems, currency: detectCurrency(rows, opts.hasHeader) };
}

/**
 * A currency column is not worth mapping by hand, but it is worth reading — it
 * saves someone hunting for the setting after their first import.
 */
function detectCurrency(rows: string[][], hasHeader: boolean): string | undefined {
  if (!hasHeader || !rows.length) return undefined;
  const idx = rows[0].findIndex((h) => /^\s*currency\s*$/i.test(String(h ?? '')));
  if (idx < 0) return undefined;

  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows.slice(1)) {
    const v = String(row[idx] ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(v)) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
    total++;
  }
  if (!total) return undefined;
  const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return n / total >= 0.8 ? best : undefined;
}

function looksLikeIncome(s: string): boolean {
  return /credit|cr\b|income|deposit|refund|salary|received|in\b/i.test(s);
}

const dupeKey = (t: Transaction) =>
  `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase().slice(0, 24)}`;

/**
 * Incoming rows that are already in the ledger, matched on date + amount +
 * merchant — so re-importing the same export doesn't double everything.
 *
 * Repeats *within* the incoming file are deliberately not flagged. Two identical
 * charges minutes apart — a phone top-up bought twice, the same transfer sent
 * again — are ordinary, and silently dropping the second would quietly
 * understate someone's spending. The overview flags possible duplicates for a
 * human to look at instead, which is reversible.
 */
export function findDuplicates(incoming: Transaction[], existing: Transaction[]): Set<string> {
  const seen = new Set(existing.map(dupeKey));
  const dupes = new Set<string>();
  for (const t of incoming) {
    if (seen.has(dupeKey(t))) dupes.add(t.id);
  }
  return dupes;
}

export function todayForImport(): string {
  return todayISO();
}

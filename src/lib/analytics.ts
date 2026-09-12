import {
  addDays,
  addMonths,
  daysBetween,
  fromISO,
  inRange,
  periodOf,
  previousRange,
  rangeLength,
  startOfWeek,
  todayISO,
} from './dates';
import { merchantKey, prettyMerchant } from './format';
import { OTHER_COLOR, UNCATEGORIZED, categoryColor, categorySlot } from './defaults';
import type {
  Budget,
  Category,
  DateRange,
  Settings,
  Transaction,
  TxnFilter,
  Sort,
} from './types';

/** Signed value: income positive, expense negative, transfers zero. */
export function signed(t: Transaction): number {
  if (t.type === 'income') return t.amount;
  if (t.type === 'transfer') return 0;
  return -t.amount;
}

/** Rows that count toward money maths — excludes transfers and opted-out rows. */
export function countable(t: Transaction): boolean {
  return !t.excluded && t.type !== 'transfer';
}

export interface Totals {
  income: number;
  expense: number;
  net: number;
  count: number;
  /** Average spend per day across the window. */
  burnRate: number;
  largest: Transaction | null;
}

export function totals(txns: Transaction[], range?: DateRange | null): Totals {
  let income = 0;
  let expense = 0;
  let count = 0;
  let largest: Transaction | null = null;

  for (const t of txns) {
    if (!countable(t)) continue;
    if (range && !inRange(t.date, range)) continue;
    count++;
    if (t.type === 'income') income += t.amount;
    else {
      expense += t.amount;
      if (!largest || t.amount > largest.amount) largest = t;
    }
  }

  const days = range ? rangeLength(range) : spanDays(txns);
  return {
    income,
    expense,
    net: income - expense,
    count,
    burnRate: days > 0 ? expense / days : 0,
    largest,
  };
}

function spanDays(txns: Transaction[]): number {
  if (!txns.length) return 0;
  let min = txns[0].date;
  let max = txns[0].date;
  for (const t of txns) {
    if (t.date < min) min = t.date;
    if (t.date > max) max = t.date;
  }
  return daysBetween(min, max) + 1;
}

export interface Delta {
  current: number;
  previous: number;
  /** Fractional change; null when there's no baseline to compare against. */
  change: number | null;
}

export function deltaVsPrevious(
  txns: Transaction[],
  range: DateRange,
  pick: (t: Totals) => number,
): Delta {
  const cur = pick(totals(txns, range));
  const prev = pick(totals(txns, previousRange(range)));
  return {
    current: cur,
    previous: prev,
    change: prev === 0 ? null : (cur - prev) / Math.abs(prev),
  };
}

export interface CategorySlice {
  name: string;
  value: number;
  count: number;
  color: string;
  /** Palette slot 1-8, or 0 for the neutral bucket. Charts order marks by this. */
  slot: number;
  share: number;
  /**
   * The real category names this slice stands for — itself, or every category
   * folded into "Other". Filtering must use these: "Other" is a label this
   * function invents, and no transaction carries it.
   */
  members: string[];
}

/**
 * Spend per category, biggest first. Everything past `limit` folds into a
 * neutral "Other" — categorical hues are never cycled or generated.
 */
export function byCategory(
  txns: Transaction[],
  categories: Category[],
  range: DateRange | null,
  opts: { limit?: number; direction?: 'expense' | 'income' } = {},
): CategorySlice[] {
  const limit = opts.limit ?? 8;
  const want = opts.direction ?? 'expense';
  const map = new Map<string, { value: number; count: number }>();
  let total = 0;

  for (const t of txns) {
    if (!countable(t)) continue;
    if (range && !inRange(t.date, range)) continue;
    if (t.type !== want) continue;
    const key = t.category || UNCATEGORIZED;
    const e = map.get(key) ?? { value: 0, count: 0 };
    e.value += t.amount;
    e.count += 1;
    map.set(key, e);
    total += t.amount;
  }

  const rows = [...map.entries()]
    .map(([name, e]) => ({
      name,
      value: e.value,
      count: e.count,
      color: categoryColor(categories, name),
      slot: categorySlot(categories, name),
      share: total ? e.value / total : 0,
      members: [name],
    }))
    .sort((a, b) => b.value - a.value);

  if (rows.length <= limit) return rows;

  const head = rows.slice(0, limit - 1);
  const tail = rows.slice(limit - 1);
  head.push({
    name: 'Other',
    value: tail.reduce((s, r) => s + r.value, 0),
    count: tail.reduce((s, r) => s + r.count, 0),
    color: OTHER_COLOR,
    slot: 0,
    share: tail.reduce((s, r) => s + r.share, 0),
    members: tail.map((r) => r.name),
  });
  return head;
}

export interface SeriesPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}

export type Bucket = 'day' | 'week' | 'month';

/** Bucket transactions into an evenly spaced time series with no gaps. */
export function timeSeries(
  txns: Transaction[],
  range: DateRange,
  bucket: Bucket,
  settings: Pick<Settings, 'locale' | 'weekStart'>,
): SeriesPoint[] {
  const keyOf = (iso: string): string => {
    if (bucket === 'day') return iso;
    if (bucket === 'week') return startOfWeek(iso, settings.weekStart);
    return iso.slice(0, 7) + '-01';
  };

  const multiYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  const buckets = new Map<string, SeriesPoint>();
  // Pre-seed every slot so empty periods render as real zeros, not gaps.
  let cursor = keyOf(range.from);
  const guard = 2000;
  for (let i = 0; i < guard && cursor <= range.to; i++) {
    buckets.set(cursor, {
      key: cursor,
      label: bucketLabel(cursor, bucket, settings.locale, multiYear),
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    });
    cursor = bucket === 'day' ? addDays(cursor, 1) : bucket === 'week' ? addDays(cursor, 7) : addMonths(cursor, 1);
  }

  for (const t of txns) {
    if (!countable(t)) continue;
    if (!inRange(t.date, range)) continue;
    const k = keyOf(t.date);
    const b = buckets.get(k);
    if (!b) continue;
    if (t.type === 'income') b.income += t.amount;
    else b.expense += t.amount;
    b.net = b.income - b.expense;
    b.count++;
  }

  return [...buckets.values()];
}

function bucketLabel(iso: string, bucket: Bucket, locale: string, multiYear = false): string {
  const d = fromISO(iso);
  if (bucket === 'month') {
    return multiYear
      ? d.toLocaleDateString(locale, { month: 'short', year: '2-digit' })
      : d.toLocaleDateString(locale, { month: 'short' });
  }
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** Choose a sensible bucket size for the window length. */
export function autoBucket(range: DateRange): Bucket {
  const n = rangeLength(range);
  if (n <= 45) return 'day';
  if (n <= 200) return 'week';
  return 'month';
}

export interface MerchantRow {
  key: string;
  name: string;
  total: number;
  count: number;
  average: number;
  lastDate: string;
  category: string;
}

export function byMerchant(txns: Transaction[], range: DateRange | null): MerchantRow[] {
  const map = new Map<string, MerchantRow>();
  for (const t of txns) {
    if (!countable(t) || t.type !== 'expense') continue;
    if (range && !inRange(t.date, range)) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const row = map.get(key) ?? {
      key,
      name: prettyMerchant(t.description),
      total: 0,
      count: 0,
      average: 0,
      lastDate: t.date,
      category: t.category,
    };
    row.total += t.amount;
    row.count += 1;
    if (t.date > row.lastDate) {
      row.lastDate = t.date;
      row.category = t.category;
    }
    map.set(key, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, average: r.total / r.count }))
    .sort((a, b) => b.total - a.total);
}

export interface RecurringRow extends MerchantRow {
  /** Median gap between charges, in days. */
  cadenceDays: number;
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';
  nextExpected: string;
  /** 0-1. How regular the gaps and the amounts are. */
  confidence: number;
  amountVaries: boolean;
}

/**
 * Detects subscriptions and standing charges: a merchant seen >= 3 times with
 * consistent gaps. Deliberately conservative — a false "subscription" is worse
 * than a missed one.
 */
export function detectRecurring(txns: Transaction[], minOccurrences = 3): RecurringRow[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!countable(t) || t.type !== 'expense') continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const out: RecurringRow[] = [];
  for (const [key, list] of groups) {
    if (list.length < minOccurrences) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    if (!gaps.length) continue;

    const gap = median(gaps);
    if (gap < 5 || gap > 400) continue;

    // Regularity: how tightly gaps cluster around the median.
    const gapSpread = median(gaps.map((g) => Math.abs(g - gap))) / gap;
    const amounts = sorted.map((t) => t.amount);
    const amt = median(amounts);
    const amtSpread = amt ? median(amounts.map((a) => Math.abs(a - amt))) / amt : 1;

    const confidence = clamp01(1 - gapSpread * 1.6) * 0.7 + clamp01(1 - amtSpread * 2) * 0.3;
    if (confidence < 0.45) continue;

    const last = sorted[sorted.length - 1];
    out.push({
      key,
      name: prettyMerchant(last.description),
      total: sorted.reduce((s, t) => s + t.amount, 0),
      count: sorted.length,
      average: amt,
      lastDate: last.date,
      category: last.category,
      cadenceDays: gap,
      cadence: labelCadence(gap),
      nextExpected: addDays(last.date, Math.round(gap)),
      confidence,
      amountVaries: amtSpread > 0.12,
    });
  }

  return out.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));
}

export function monthlyEquivalent(r: RecurringRow): number {
  return (r.average * 30.44) / r.cadenceDays;
}

function labelCadence(days: number): RecurringRow['cadence'] {
  if (near(days, 7, 2)) return 'weekly';
  if (near(days, 14, 3)) return 'biweekly';
  if (near(days, 30.44, 6)) return 'monthly';
  if (near(days, 91, 14)) return 'quarterly';
  if (near(days, 365, 40)) return 'yearly';
  return 'irregular';
}

const near = (v: number, target: number, tol: number) => Math.abs(v - target) <= tol;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface BudgetStatus {
  budget: Budget;
  category: Category | undefined;
  name: string;
  limit: number;
  spent: number;
  /** Unspent carried in from prior periods; 0 when rollover is off. */
  carried: number;
  remaining: number;
  ratio: number;
  /** Where we'd land at the current pace. */
  projected: number;
  state: 'ok' | 'watch' | 'over';
  color: string;
}

export function budgetStatus(
  txns: Transaction[],
  budgets: Budget[],
  categories: Category[],
  range: DateRange,
  opts: { asOf?: string } = {},
): BudgetStatus[] {
  const asOf = opts.asOf ?? todayISO();
  const elapsed = Math.min(rangeLength(range), Math.max(1, daysBetween(range.from, asOf) + 1));
  const total = rangeLength(range);
  const pace = elapsed / total;

  return budgets
    .map((b) => {
      const cat = categories.find((c) => c.id === b.categoryId);
      const name = cat?.name ?? b.categoryId;
      let spent = 0;
      for (const t of txns) {
        if (!countable(t) || t.type !== 'expense') continue;
        if (!inRange(t.date, range)) continue;
        if ((t.category || UNCATEGORIZED) === name) spent += t.amount;
      }
      const carried = b.rollover ? rolloverFor(txns, b, name, range) : 0;
      const limit = b.amount + carried;
      const ratio = limit > 0 ? spent / limit : spent > 0 ? Infinity : 0;
      const projected = pace > 0 ? spent / pace : spent;
      const state: BudgetStatus['state'] = ratio > 1 ? 'over' : projected > limit * 1.02 || ratio > 0.85 ? 'watch' : 'ok';
      return {
        budget: b,
        category: cat,
        name,
        limit,
        spent,
        carried,
        remaining: limit - spent,
        ratio,
        projected,
        state,
        color: categoryColor(categories, name),
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/**
 * Unspent budget from up to 6 prior periods. Surplus is capped at 3× the base
 * and carried debt at half of it — an overspent month should tighten the next
 * one, not wipe the budget out and leave a meaningless 0 cap on screen.
 */
function rolloverFor(txns: Transaction[], b: Budget, name: string, range: DateRange): number {
  let carried = 0;
  let r = previousRange(range);
  for (let i = 0; i < 6; i++) {
    let spent = 0;
    for (const t of txns) {
      if (!countable(t) || t.type !== 'expense') continue;
      if (!inRange(t.date, r)) continue;
      if ((t.category || UNCATEGORIZED) === name) spent += t.amount;
    }
    // Only count periods that actually had activity, so a fresh budget doesn't
    // inherit months of phantom surplus.
    if (spent === 0) break;
    carried += b.amount - spent;
    r = previousRange(r);
  }
  return Math.max(-b.amount * 0.5, Math.min(b.amount * 3, carried));
}

export interface CashflowPoint {
  date: string;
  balance: number;
}

/**
 * Running net position across a window — the shape of the month.
 * Stops at today: carrying a flat line out to month-end looks like a week of
 * spending nothing, rather than a week that hasn't happened.
 */
export function cashflow(txns: Transaction[], range: DateRange, asOf = todayISO()): CashflowPoint[] {
  const daily = new Map<string, number>();
  for (const t of txns) {
    if (!countable(t) || !inRange(t.date, range)) continue;
    daily.set(t.date, (daily.get(t.date) ?? 0) + signed(t));
  }
  const end = range.to > asOf && range.from <= asOf ? asOf : range.to;
  const out: CashflowPoint[] = [];
  let running = 0;
  for (let d = range.from; d <= end; d = addDays(d, 1)) {
    running += daily.get(d) ?? 0;
    out.push({ date: d, balance: running });
  }
  return out;
}

/** Spend by weekday (0=Sun) — surfaces the "weekend problem" at a glance. */
export function byWeekday(txns: Transaction[], range: DateRange | null): { day: number; total: number; count: number }[] {
  const rows = Array.from({ length: 7 }, (_, day) => ({ day, total: 0, count: 0 }));
  for (const t of txns) {
    if (!countable(t) || t.type !== 'expense') continue;
    if (range && !inRange(t.date, range)) continue;
    const d = fromISO(t.date).getDay();
    rows[d].total += t.amount;
    rows[d].count++;
  }
  return rows;
}

export interface MemberSplit {
  member: string;
  expense: number;
  income: number;
  count: number;
  share: number;
  slot: number;
}

export function byMember(txns: Transaction[], range: DateRange | null, members: string[]): MemberSplit[] {
  const map = new Map<string, MemberSplit>();
  let total = 0;
  for (const t of txns) {
    if (!countable(t)) continue;
    if (range && !inRange(t.date, range)) continue;
    const key = t.member || 'Unassigned';
    const row = map.get(key) ?? { member: key, expense: 0, income: 0, count: 0, share: 0, slot: 1 };
    if (t.type === 'income') row.income += t.amount;
    else {
      row.expense += t.amount;
      total += t.amount;
    }
    row.count++;
    map.set(key, row);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      share: total ? r.expense / total : 0,
      // Colour follows the person, not their rank, so filtering never repaints.
      slot: (members.indexOf(r.member) % 8) + 1 || 1,
    }))
    .sort((a, b) => b.expense - a.expense);
}

/**
 * Month-end projection.
 *
 * A naive run-rate badly over-projects early in the month, because rent and
 * every other fixed charge has already landed and gets extrapolated as if it
 * repeats daily. So this splits the two: discretionary spend is extrapolated
 * at its own pace, and fixed charges are added only for the dates they are
 * actually expected on.
 */
export function projectPeriod(
  txns: Transaction[],
  range: DateRange,
  recurring: RecurringRow[],
  asOf = todayISO(),
): { projected: number; spentSoFar: number; upcoming: number; daysLeft: number } {
  const soFar: DateRange = { from: range.from, to: min(asOf, range.to) };
  const spentSoFar = totals(txns, soFar).expense;
  const elapsed = Math.max(1, daysBetween(soFar.from, soFar.to) + 1);
  const daysLeft = Math.max(0, rangeLength(range) - elapsed);

  const fixed = new Set(recurring.filter((r) => r.confidence > 0.6).map((r) => r.key));

  let fixedSoFar = 0;
  for (const t of txns) {
    if (!countable(t) || t.type !== 'expense' || !inRange(t.date, soFar)) continue;
    if (fixed.has(merchantKey(t.description))) fixedSoFar += t.amount;
  }

  const upcoming = recurring
    .filter((r) => r.confidence > 0.6 && r.nextExpected > asOf && r.nextExpected <= range.to)
    .reduce((s, r) => s + r.average, 0);

  const discretionaryRate = (spentSoFar - fixedSoFar) / elapsed;
  return {
    spentSoFar,
    upcoming,
    daysLeft,
    projected: spentSoFar + Math.max(0, discretionaryRate) * daysLeft + upcoming,
  };
}

const min = (a: string, b: string) => (a < b ? a : b);

/** Rows that look wrong and are worth a human glance. */
export interface Anomaly {
  txn: Transaction;
  reason: string;
  severity: 'info' | 'warn';
}

export function findAnomalies(txns: Transaction[], settings: Settings, range: DateRange): Anomaly[] {
  const out: Anomaly[] = [];
  const window = txns.filter((t) => inRange(t.date, range) && countable(t));

  // 1. Possible duplicates: same merchant + amount within 3 days.
  const seen = new Map<string, Transaction>();
  for (const t of [...window].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = `${merchantKey(t.description)}|${t.amount.toFixed(2)}`;
    const prev = seen.get(k);
    if (prev && Math.abs(daysBetween(prev.date, t.date)) <= 3 && prev.id !== t.id) {
      out.push({ txn: t, reason: `Possible duplicate of ${prettyMerchant(prev.description)} on ${prev.date}`, severity: 'warn' });
    }
    seen.set(k, t);
  }

  // 2. Unusually large for its own category (3x the category median).
  const perCat = new Map<string, number[]>();
  for (const t of txns) {
    if (!countable(t) || t.type !== 'expense') continue;
    const arr = perCat.get(t.category) ?? [];
    arr.push(t.amount);
    perCat.set(t.category, arr);
  }
  for (const t of window) {
    if (t.type !== 'expense') continue;
    const arr = perCat.get(t.category);
    if (!arr || arr.length < 6) continue;
    const m = median(arr);
    if (m > 0 && t.amount > m * 3 && t.amount >= settings.largeAmount) {
      out.push({ txn: t, reason: `${Math.round(t.amount / m)}× the usual ${t.category} charge`, severity: 'info' });
    }
  }

  // 3. Still uncategorized.
  for (const t of window) {
    if (!t.category || t.category === UNCATEGORIZED) {
      out.push({ txn: t, reason: 'Not categorized yet', severity: 'info' });
    }
  }

  const dedup = new Map<string, Anomaly>();
  for (const a of out) if (!dedup.has(a.txn.id)) dedup.set(a.txn.id, a);
  return [...dedup.values()].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1));
}

/* --------------------------- filtering & sorting -------------------------- */

export const EMPTY_FILTER: TxnFilter = {
  search: '',
  categories: [],
  accounts: [],
  members: [],
  types: [],
  tags: [],
  range: null,
  min: null,
  max: null,
  excluded: 'any',
  uncategorizedOnly: false,
};

export function filterCount(f: TxnFilter): number {
  let n = 0;
  if (f.search.trim()) n++;
  n += f.categories.length ? 1 : 0;
  n += f.accounts.length ? 1 : 0;
  n += f.members.length ? 1 : 0;
  n += f.types.length ? 1 : 0;
  n += f.tags.length ? 1 : 0;
  if (f.range) n++;
  if (f.min != null || f.max != null) n++;
  if (f.excluded !== 'any') n++;
  if (f.uncategorizedOnly) n++;
  return n;
}

export function applyFilter(txns: Transaction[], f: TxnFilter): Transaction[] {
  const terms = f.search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return txns.filter((t) => {
    if (f.range && !inRange(t.date, f.range)) return false;
    if (f.types.length && !f.types.includes(t.type)) return false;
    if (f.categories.length && !f.categories.includes(t.category || UNCATEGORIZED)) return false;
    if (f.accounts.length && !f.accounts.includes(t.account)) return false;
    if (f.members.length && !f.members.includes(t.member)) return false;
    if (f.tags.length && !f.tags.some((tag) => t.tags.includes(tag))) return false;
    if (f.min != null && t.amount < f.min) return false;
    if (f.max != null && t.amount > f.max) return false;
    if (f.excluded === 'only' && !t.excluded) return false;
    if (f.excluded === 'hide' && t.excluded) return false;
    if (f.uncategorizedOnly && t.category && t.category !== UNCATEGORIZED) return false;
    if (terms.length) {
      const hay = `${t.description} ${t.category} ${t.account} ${t.member} ${t.notes} ${t.tags.join(' ')} ${t.amount}`.toLowerCase();
      // Every term must appear somewhere — behaves like people expect search to.
      if (!terms.every((term) => hay.includes(term))) return false;
    }
    return true;
  });
}

export function sortTxns(txns: Transaction[], sort: Sort): Transaction[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...txns].sort((a, b) => {
    let cmp = 0;
    switch (sort.key) {
      case 'amount':
        cmp = a.amount - b.amount;
        break;
      case 'description':
        cmp = a.description.localeCompare(b.description);
        break;
      case 'category':
        cmp = (a.category || '').localeCompare(b.category || '');
        break;
      default:
        cmp = a.date.localeCompare(b.date);
        // Stable secondary sort so the list never jitters between renders.
        if (cmp === 0) cmp = a.id.localeCompare(b.id);
    }
    return cmp * dir;
  });
}

export function groupByDay(txns: Transaction[]): { date: string; items: Transaction[]; total: number }[] {
  const map = new Map<string, Transaction[]>();
  for (const t of txns) {
    const arr = map.get(t.date) ?? [];
    arr.push(t);
    map.set(t.date, arr);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      items,
      total: items.reduce((s, t) => s + (countable(t) ? signed(t) : 0), 0),
    }));
}

/** Every distinct tag across the ledger, most used first. */
export function allTags(txns: Transaction[]): string[] {
  const counts = new Map<string, number>();
  for (const t of txns) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

export function allAccounts(txns: Transaction[]): string[] {
  return [...new Set(txns.map((t) => t.account).filter(Boolean))].sort();
}

/** The oldest date in the ledger, or undefined when it's empty. */
export function earliestDate(txns: Transaction[]): string | undefined {
  let min: string | undefined;
  for (const t of txns) if (t.date && (!min || t.date < min)) min = t.date;
  return min;
}

/**
 * Preset windows for the date-range control. `earliest` bounds the "all time"
 * option to the data that actually exists — several views walk the window a day
 * at a time, and an unbounded range would mean tens of thousands of empty days.
 */
export function presetRanges(
  monthStartDay: number,
  earliest?: string,
): { id: string; label: string; range: DateRange }[] {
  const today = todayISO();
  const thisPeriod = periodOf(today, monthStartDay);
  const lastPeriod = periodOf(addDays(thisPeriod.from, -1), monthStartDay);
  const y = fromISO(today).getFullYear();
  return [
    { id: 'this', label: 'This month', range: thisPeriod },
    { id: 'last', label: 'Last month', range: lastPeriod },
    { id: '30', label: 'Last 30 days', range: { from: addDays(today, -29), to: today } },
    { id: '90', label: 'Last 90 days', range: { from: addDays(today, -89), to: today } },
    { id: '6m', label: 'Last 6 months', range: { from: addMonths(today, -6), to: today } },
    { id: 'ytd', label: 'Year to date', range: { from: `${y}-01-01`, to: today } },
    { id: '12m', label: 'Last 12 months', range: { from: addMonths(today, -12), to: today } },
    { id: 'all', label: 'All time', range: { from: earliest || addMonths(today, -24), to: today } },
  ];
}

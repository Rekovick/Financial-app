import { addDays, periodOf, shiftPeriod } from './dates';
import { countable, detectRecurring } from './analytics';
import { merchantKey } from './format';
import { UNCATEGORIZED, categoryByName } from './defaults';
import type { Category, DateRange, Transaction } from './types';

/**
 * Turning one number — "I want to spend X this month" — into a budget per
 * category, grounded in what each category actually costs.
 *
 * The naive version scales every category by the same factor, which is bad
 * advice: rent and a phone contract can't be cut by 20% by deciding to. So
 * categories are split into two kinds. Fixed ones, which barely move month to
 * month or are carried by recurring bills, keep their real cost. Flexible ones
 * share whatever is left of the target, in proportion to what they usually
 * take. The person can override which is which.
 */

export interface PlanRow {
  name: string;
  categoryId: string | null;
  /** Average month across the periods used, quiet months counted as zero. */
  average: number;
  /** Lowest and highest single month — shows how much a category swings. */
  low: number;
  high: number;
  monthsSeen: number;
  /** True when the category is held at its average rather than cut. */
  fixed: boolean;
  /** Why it was judged fixed by default, for display. Null when flexible. */
  fixedReason: 'steady' | 'bills' | null;
  suggested: number;
}

export interface Plan {
  rows: PlanRow[];
  /** The complete periods the averages come from, oldest first. */
  periods: DateRange[];
  typicalTotal: number;
  fixedTotal: number;
  flexibleTypical: number;
  /** What the flexible categories get between them. */
  flexibleBudget: number;
  total: number;
  /** Flexible spending must shrink by this fraction (negative means grow). */
  cut: number;
  /** False when fixed costs alone already exceed the target. */
  feasible: boolean;
}

/**
 * Variation below this, month to month, reads as a fixed cost. Rent, insurance
 * and contracts sit near zero; a bill with taxes or a little usage stays under
 * a few percent. Dining that swings 900 → 1,300 → 1,100 is ~15% and must not
 * qualify — at 0.15 it did, and got locked as if it were rent.
 */
const STEADY_CV = 0.08;
/** Share of a category's spend that must come from fixed bills to lock it. */
const BILLS_SHARE = 0.6;

/** The last `count` complete periods before the one containing `asOf`. */
export function completePeriods(asOf: string, monthStartDay: number, count: number): DateRange[] {
  const current = periodOf(asOf, monthStartDay);
  const out: DateRange[] = [];
  for (let i = count; i >= 1; i--) {
    const from = shiftPeriod(current.from, -i, monthStartDay);
    out.push({ from, to: addDays(shiftPeriod(from, 1, monthStartDay), -1) });
  }
  return out;
}

/** How many complete periods of history exist, capped at `max`. */
export function periodsAvailable(
  transactions: Transaction[],
  asOf: string,
  monthStartDay: number,
  max = 6,
): number {
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const t of transactions) {
    if (!t.date) continue;
    if (!earliest || t.date < earliest) earliest = t.date;
    if (!latest || t.date > latest) latest = t.date;
  }
  if (!earliest || !latest) return 0;
  const periods = completePeriods(asOf, monthStartDay, max);
  // A month only counts if the ledger covers it from start to finish. One that
  // was half-recorded — data starting mid-month, or a snapshot that stops on the
  // 11th — would make every category look far cheaper than it is, and the plan
  // would be built on a fraction of a month.
  return periods.filter((p) => p.from >= earliest! && latest! >= addDays(p.to, -7)).length;
}

/** Rounds to a step that suits the size of the number. */
export function niceRound(value: number): number {
  if (value <= 0) return 0;
  const step = value < 200 ? 10 : value < 1000 ? 25 : value < 5000 ? 50 : 100;
  return Math.round(value / step) * step;
}

export function planBudgets(input: {
  transactions: Transaction[];
  categories: Category[];
  asOf: string;
  monthStartDay: number;
  target: number;
  /** How many complete months to learn from. */
  months: number;
  /** Per-category overrides of fixed/flexible, keyed by category name. */
  overrides?: Record<string, boolean>;
}): Plan {
  const { transactions, categories, asOf, monthStartDay, target, overrides = {} } = input;
  const periods = completePeriods(asOf, monthStartDay, Math.max(1, input.months));
  const from = periods[0].from;
  const to = periods[periods.length - 1].to;

  // Spend per category per period.
  const perPeriod = new Map<string, number[]>();
  const byMerchant = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (!countable(t) || t.type !== 'expense') continue;
    if (t.date < from || t.date > to) continue;
    const name = t.category || UNCATEGORIZED;
    const cat = categoryByName(categories, name);
    // Income and transfer categories never get a spending budget.
    if (cat && (cat.group === 'income' || cat.group === 'transfer')) continue;

    const idx = periods.findIndex((p) => t.date >= p.from && t.date <= p.to);
    if (idx < 0) continue;
    const arr = perPeriod.get(name) ?? new Array(periods.length).fill(0);
    arr[idx] += t.amount;
    perPeriod.set(name, arr);

    const merchants = byMerchant.get(name) ?? new Map<string, number>();
    const key = merchantKey(t.description);
    merchants.set(key, (merchants.get(key) ?? 0) + t.amount);
    byMerchant.set(name, merchants);
  }

  // Merchants the recurring detector is confident are steady bills.
  const bills = new Set(
    detectRecurring(transactions)
      .filter((r) => !r.amountVaries && r.confidence > 0.6)
      .map((r) => r.key),
  );

  const rows: PlanRow[] = [];
  for (const [name, values] of perPeriod) {
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum <= 0) continue;
    const average = sum / values.length;
    const monthsSeen = values.filter((v) => v > 0).length;

    // Steady: present every month and barely moving. A category that only
    // appears some months is by definition not a fixed monthly cost.
    const mean = average;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const steady = monthsSeen === values.length && cv <= STEADY_CV;

    let billSpend = 0;
    for (const [key, amount] of byMerchant.get(name) ?? []) if (bills.has(key)) billSpend += amount;
    const carriedByBills = sum > 0 && billSpend / sum >= BILLS_SHARE;

    const fixedReason: PlanRow['fixedReason'] = steady ? 'steady' : carriedByBills ? 'bills' : null;
    const fixed = name in overrides ? overrides[name] : fixedReason !== null;

    rows.push({
      name,
      categoryId: categoryByName(categories, name)?.id ?? null,
      average,
      low: Math.min(...values),
      high: Math.max(...values),
      monthsSeen,
      fixed,
      fixedReason,
      suggested: 0,
    });
  }

  rows.sort((a, b) => b.average - a.average);

  const typicalTotal = rows.reduce((s, r) => s + r.average, 0);
  const fixedRows = rows.filter((r) => r.fixed);
  const flexRows = rows.filter((r) => !r.fixed);
  const flexibleTypical = flexRows.reduce((s, r) => s + r.average, 0);

  // Fixed costs keep what they really cost — rounded up, so the budget
  // doesn't read "over" the first month a bill lands a little high.
  for (const r of fixedRows) r.suggested = Math.max(niceRound(r.average), Math.ceil(r.average));

  const fixedBudget = fixedRows.reduce((s, r) => s + r.suggested, 0);
  const flexibleBudget = Math.max(0, target - fixedBudget);
  const feasible = target >= fixedBudget;

  if (flexibleTypical > 0 && flexibleBudget > 0) {
    const scale = flexibleBudget / flexibleTypical;
    for (const r of flexRows) r.suggested = niceRound(r.average * scale);

    // Rounding drifts the sum away from the target; settle the difference on
    // the biggest flexible category, where it is proportionally smallest.
    const drift = flexibleBudget - flexRows.reduce((s, r) => s + r.suggested, 0);
    const biggest = flexRows[0];
    if (biggest) biggest.suggested = Math.max(0, biggest.suggested + drift);
  }

  const total = rows.reduce((s, r) => s + r.suggested, 0);
  return {
    rows,
    periods,
    typicalTotal,
    fixedTotal: fixedBudget,
    flexibleTypical,
    flexibleBudget,
    total,
    cut: flexibleTypical > 0 ? 1 - flexibleBudget / flexibleTypical : 0,
    feasible,
  };
}

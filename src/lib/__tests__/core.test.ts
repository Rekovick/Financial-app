/**
 * Tests for the pure money logic — the places where a quiet bug produces a
 * wrong number rather than a visible crash.
 *
 * Run with:  npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAmount, money, prettyMerchant, merchantKey, compactNumber } from '../format.ts';
import {
  addDays,
  addMonths,
  coerceDate,
  daysBetween,
  periodOf,
  previousRange,
  rangeLength,
  periodLabel,
  startOfWeek,
  toISO,
  todayISO,
} from '../dates.ts';
import {
  applyFilter,
  budgetStatus,
  byCategory,
  byMember,
  cashflow,
  detectRecurring,
  earliestDate,
  EMPTY_FILTER,
  findAnomalies,
  presetRanges,
  projectPeriod,
  signed,
  sortTxns,
  timeSeries,
  totals,
} from '../analytics.ts';
import { applyRules, previewRule, ruleFromTransaction } from '../rules.ts';
import { parseCSV, toCSV, guessMapping, rowsToTransactions, findDuplicates } from '../csv.ts';
import { DEFAULT_CATEGORIES, DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../defaults.ts';
import { configFromSheet, newCategories } from '../adopt.ts';
import type { Transaction } from '../types.ts';

const S = { ...DEFAULT_SETTINGS };

let n = 0;
function txn(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${++n}`,
    date: '2026-03-10',
    description: 'Test',
    amount: 10,
    type: 'expense',
    category: 'Dining',
    account: 'Visa',
    member: 'Me',
    notes: '',
    tags: [],
    excluded: false,
    cleared: false,
    source: 'app',
    ...partial,
  };
}

/* ------------------------------- formatting ------------------------------- */

test('parseAmount handles the shapes people actually type', () => {
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1.234,56'), 1234.56, 'European grouping');
  assert.equal(parseAmount('12,5'), 12.5, 'decimal comma');
  assert.equal(parseAmount('1,250'), 1250, 'thousands comma');
  assert.equal(parseAmount('$1,234.50'), 1234.5);
  assert.equal(parseAmount('(45.00)'), -45, 'accounting negative');
  assert.equal(parseAmount('45-'), -45, 'trailing minus');
  assert.equal(parseAmount('-45'), -45);
  assert.equal(parseAmount('SAR 320.00'), 320);
  assert.equal(parseAmount('١٢٣٤'), 1234, 'Arabic-Indic digits');
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('   '), null);
  assert.equal(parseAmount('abc'), null);
});

test('money formats and signs correctly', () => {
  assert.equal(money(1234.5, { currency: 'USD', locale: 'en-US' }), '$1,234.50');
  assert.equal(money(-20, { currency: 'USD', locale: 'en-US' }), '$20.00', 'unsigned by default');
  assert.equal(money(-20, { currency: 'USD', locale: 'en-US' }, { sign: true }), '-$20.00');
  assert.equal(money(20, { currency: 'USD', locale: 'en-US' }, { sign: true }), '+$20.00');
});

test('compactNumber keeps axis ticks short', () => {
  assert.equal(compactNumber(0), '0');
  assert.equal(compactNumber(950), '950');
  assert.equal(compactNumber(1500), '1.5K');
});

test('prettyMerchant tidies statement noise without losing the name', () => {
  assert.equal(prettyMerchant('AMAZON.COM*2K4L5X'), 'Amazon.com');
  assert.equal(prettyMerchant('POS 8811 MERCHANT'), 'Merchant');
  assert.equal(prettyMerchant('Whole Foods'), 'Whole Foods', 'already tidy text is left alone');
  assert.equal(prettyMerchant(''), '');
  assert.equal(prettyMerchant('   '), '');
  assert.equal(merchantKey('STARBUCKS STORE 09112'), merchantKey('STARBUCKS STORE 44120'));
});

/* --------------------------------- dates ---------------------------------- */

test('periodOf handles calendar months', () => {
  assert.deepEqual(periodOf('2026-03-15', 1), { from: '2026-03-01', to: '2026-03-31' });
  assert.deepEqual(periodOf('2026-02-01', 1), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(periodOf('2024-02-10', 1), { from: '2024-02-01', to: '2024-02-29' }, 'leap year');
});

test('periodOf handles a salary cycle starting mid-month', () => {
  assert.deepEqual(periodOf('2026-03-04', 25), { from: '2026-02-25', to: '2026-03-24' });
  assert.deepEqual(periodOf('2026-03-25', 25), { from: '2026-03-25', to: '2026-04-24' });
  assert.deepEqual(periodOf('2026-03-24', 25), { from: '2026-02-25', to: '2026-03-24' }, 'last day of the cycle');
});

test('date arithmetic clamps short months', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-03-01', '2026-03-31'), 30);
  assert.equal(rangeLength({ from: '2026-03-01', to: '2026-03-31' }), 31);
});

test('previousRange is the same length, immediately before', () => {
  const prev = previousRange({ from: '2026-03-01', to: '2026-03-31' });
  assert.deepEqual(prev, { from: '2026-01-29', to: '2026-02-28' });
  assert.equal(rangeLength(prev), 31);
});

test('startOfWeek respects the configured first day', () => {
  // 2026-03-11 is a Wednesday.
  assert.equal(startOfWeek('2026-03-11', 1), '2026-03-09', 'Monday');
  assert.equal(startOfWeek('2026-03-11', 0), '2026-03-08', 'Sunday');
});

test('coerceDate reads the formats a sheet throws at it', () => {
  assert.equal(coerceDate('2026-03-04'), '2026-03-04');
  assert.equal(coerceDate('03/04/2026'), '2026-03-04', 'month-first by default');
  assert.equal(coerceDate('03/04/2026', true), '2026-04-03', 'day-first when asked');
  assert.equal(coerceDate('25/12/2026'), '2026-12-25', 'unambiguous day-first');
  assert.equal(coerceDate(45000), toISO(new Date(2023, 2, 15)), 'sheet serial number');
  assert.equal(coerceDate(''), null);
  assert.equal(coerceDate(null), null);
  assert.equal(coerceDate('not a date'), null);
});

/* -------------------------------- analytics -------------------------------- */

test('totals ignore transfers and excluded rows', () => {
  const rows = [
    txn({ amount: 100, type: 'expense' }),
    txn({ amount: 40, type: 'expense', excluded: true }),
    txn({ amount: 500, type: 'income' }),
    txn({ amount: 600, type: 'transfer' }),
  ];
  const t = totals(rows, { from: '2026-03-01', to: '2026-03-31' });
  assert.equal(t.expense, 100);
  assert.equal(t.income, 500);
  assert.equal(t.net, 400);
  assert.equal(t.count, 2);
  assert.equal(signed(rows[3]), 0, 'a transfer moves nothing net');
});

test('byCategory folds the tail into a neutral Other bucket', () => {
  const rows = [
    ...Array.from({ length: 12 }, (_, i) => txn({ amount: 12 - i, category: `Cat${i}` })),
  ];
  const slices = byCategory(rows, DEFAULT_CATEGORIES, null, { limit: 5 });
  assert.equal(slices.length, 5);
  assert.equal(slices[4].name, 'Other');
  assert.equal(slices[4].slot, 0, 'Other is never a palette slot');
  const sum = slices.reduce((s, c) => s + c.value, 0);
  assert.equal(sum, rows.reduce((s, r) => s + r.amount, 0), 'nothing is lost in the fold');
  assert.ok(Math.abs(slices.reduce((s, c) => s + c.share, 0) - 1) < 1e-9);
});

test('timeSeries emits every bucket, including empty ones', () => {
  const rows = [txn({ date: '2026-03-02', amount: 30 }), txn({ date: '2026-03-05', amount: 20 })];
  const series = timeSeries(rows, { from: '2026-03-01', to: '2026-03-07' }, 'day', S);
  assert.equal(series.length, 7);
  assert.equal(series[1].expense, 30);
  assert.equal(series[2].expense, 0, 'a quiet day is a real zero, not a gap');
});

test('cashflow accumulates a running position', () => {
  const rows = [
    txn({ date: '2026-03-01', amount: 100, type: 'income' }),
    txn({ date: '2026-03-02', amount: 30, type: 'expense' }),
  ];
  const flow = cashflow(rows, { from: '2026-03-01', to: '2026-03-03' });
  assert.deepEqual(flow.map((p) => p.balance), [100, 70, 70]);
});

test('budgets report spend, remaining and state', () => {
  const rows = [txn({ date: '2026-03-05', amount: 120, category: 'Dining' })];
  const budgets = [{ id: 'b1', categoryId: 'dining', amount: 100, rollover: false }];
  const [status] = budgetStatus(rows, budgets, DEFAULT_CATEGORIES, { from: '2026-03-01', to: '2026-03-31' }, {
    asOf: '2026-03-10',
  });
  assert.equal(status.spent, 120);
  assert.equal(status.limit, 100);
  assert.equal(status.remaining, -20);
  assert.equal(status.state, 'over');
});

test('a rollover budget never collapses to a zero cap', () => {
  // Three prior periods, each overspent by well over the cap.
  const rows = ['2025-12', '2026-01', '2026-02'].map((m) =>
    txn({ date: `${m}-10`, amount: 900, category: 'Dining' }),
  );
  const budgets = [{ id: 'b1', categoryId: 'dining', amount: 100, rollover: true }];
  const [status] = budgetStatus(rows, budgets, DEFAULT_CATEGORIES, { from: '2026-03-01', to: '2026-03-31' });
  assert.ok(status.limit >= 50, `cap collapsed to ${status.limit}`);
});

test('recurring detection finds a monthly subscription and skips noise', () => {
  const monthly = Array.from({ length: 6 }, (_, i) =>
    txn({ date: addMonths('2026-01-04', i), description: 'NETFLIX.COM', amount: 22.99, category: 'Subscriptions' }),
  );
  const random = [
    txn({ date: '2026-01-03', description: 'CORNER SHOP', amount: 4 }),
    txn({ date: '2026-02-19', description: 'CORNER SHOP', amount: 96 }),
    txn({ date: '2026-02-21', description: 'CORNER SHOP', amount: 7 }),
  ];
  const found = detectRecurring([...monthly, ...random]);
  const netflix = found.find((r) => r.name.toLowerCase().includes('netflix'));
  assert.ok(netflix, 'the monthly subscription should be detected');
  assert.equal(netflix!.cadence, 'monthly');
  assert.equal(netflix!.amountVaries, false);
  assert.ok(netflix!.confidence > 0.8);
  assert.ok(!found.some((r) => r.name.toLowerCase().includes('corner')), 'irregular spend is not a subscription');
});

test('projection does not extrapolate fixed charges as if they repeated daily', () => {
  const range = { from: '2026-03-01', to: '2026-03-31' };
  // Rent lands once a month; coffee is a daily habit.
  const rent = Array.from({ length: 5 }, (_, i) =>
    txn({ date: addMonths('2025-11-01', i), description: 'GREENVIEW RENT', amount: 2000, category: 'Rent' }),
  );
  const coffee = Array.from({ length: 10 }, (_, i) =>
    txn({ date: addDays('2026-03-01', i), description: 'CORNER CAFE', amount: 10, category: 'Dining' }),
  );
  const p = projectPeriod([...rent, ...coffee], range, detectRecurring([...rent, ...coffee]), '2026-03-10');
  assert.equal(p.spentSoFar, 2100, '2000 rent + 100 coffee');
  // A naive run rate would project 2100/10*31 ≈ 6510. The real answer is nearer 2310.
  assert.ok(p.projected < 3000, `projected ${p.projected} — rent is being extrapolated`);
  assert.ok(p.projected > 2100);
});

test('anomaly detection flags duplicates and uncategorized rows', () => {
  const range = { from: '2026-03-01', to: '2026-03-31' };
  const rows = [
    txn({ date: '2026-03-04', description: 'TAXI CO', amount: 32 }),
    txn({ date: '2026-03-05', description: 'TAXI CO', amount: 32 }),
    txn({ date: '2026-03-06', description: 'Mystery', category: 'Uncategorized' }),
  ];
  const found = findAnomalies(rows, S, range);
  assert.ok(found.some((a) => /duplicate/i.test(a.reason)));
  assert.ok(found.some((a) => /categor/i.test(a.reason)));
});

test('member split colours follow the person, not their rank', () => {
  const rows = [txn({ member: 'Partner', amount: 200 }), txn({ member: 'Me', amount: 50 })];
  const split = byMember(rows, null, ['Me', 'Partner']);
  const partner = split.find((m) => m.member === 'Partner')!;
  const me = split.find((m) => m.member === 'Me')!;
  assert.equal(me.slot, 1);
  assert.equal(partner.slot, 2);
  // Filtering Me out must not repaint Partner.
  const filtered = byMember([rows[0]], null, ['Me', 'Partner']);
  assert.equal(filtered[0].slot, partner.slot);
});

/* -------------------------------- filtering -------------------------------- */

test('search requires every term to match somewhere', () => {
  const rows = [
    txn({ description: 'Whole Foods Market', category: 'Groceries' }),
    txn({ description: 'Whole Earth Cafe', category: 'Dining' }),
  ];
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, search: 'whole' }).length, 2);
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, search: 'whole groceries' }).length, 1);
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, search: 'whole nothing' }).length, 0);
});

test('filters combine and respect the excluded switch', () => {
  const rows = [
    txn({ amount: 10, category: 'Dining', excluded: false }),
    txn({ amount: 500, category: 'Dining', excluded: true }),
    txn({ amount: 60, category: 'Rent' }),
  ];
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, categories: ['Dining'] }).length, 2);
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, excluded: 'hide' }).length, 2);
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, excluded: 'only' }).length, 1);
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, min: 50 }).length, 2);
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, min: 50, max: 100 }).length, 1);
});

test('sorting is stable for equal dates', () => {
  const rows = [txn({ date: '2026-03-01' }), txn({ date: '2026-03-01' }), txn({ date: '2026-03-02' })];
  const a = sortTxns(rows, { key: 'date', dir: 'desc' }).map((t) => t.id);
  const b = sortTxns([...rows].reverse(), { key: 'date', dir: 'desc' }).map((t) => t.id);
  assert.deepEqual(a, b, 'the same set must always sort to the same order');
});

/* ---------------------------------- rules ---------------------------------- */

test('rules apply, and only report a change when something changed', () => {
  const rule = {
    id: 'r1',
    name: 'Coffee',
    enabled: true,
    conditions: [{ field: 'description' as const, op: 'contains' as const, value: 'STARBUCKS' }],
    actions: { category: 'Dining', addTags: ['coffee'] },
  };
  const hit = txn({ description: 'STARBUCKS 001', category: 'Uncategorized' });
  const changed = applyRules([rule], hit);
  assert.equal(changed?.category, 'Dining');
  assert.deepEqual(changed?.tags, ['coffee']);
  // Running it again is a no-op, so a sync loop can't rewrite the sheet forever.
  assert.equal(applyRules([rule], changed!), null);
  assert.equal(applyRules([rule], txn({ description: 'TESCO' })), null);
});

test('later rules override earlier ones', () => {
  const base = { enabled: true, conditions: [{ field: 'description' as const, op: 'contains' as const, value: 'A' }] };
  const first = { ...base, id: '1', name: 'first', actions: { category: 'Dining' } };
  const second = { ...base, id: '2', name: 'second', actions: { category: 'Travel' } };
  assert.equal(applyRules([first, second], txn({ description: 'AAA', category: '' }))?.category, 'Travel');
});

test('an invalid regex matches nothing rather than everything', () => {
  const rule = {
    id: 'r',
    name: 'bad',
    enabled: true,
    conditions: [{ field: 'description' as const, op: 'regex' as const, value: '([' }],
    actions: { category: 'Dining' },
  };
  assert.equal(previewRule(rule, [txn(), txn()]).length, 0);
});

test('amount conditions compare numerically', () => {
  const rule = {
    id: 'r',
    name: 'big',
    enabled: true,
    conditions: [{ field: 'amount' as const, op: 'gt' as const, value: '100' }],
    actions: { excluded: true },
  };
  assert.equal(previewRule(rule, [txn({ amount: 50 }), txn({ amount: 150 })]).length, 1);
});

test('a rule built from a transaction matches it back', () => {
  const t = txn({ description: 'SHELL OIL 574122' });
  const rule = ruleFromTransaction(t, 'Fuel');
  assert.ok(previewRule(rule, [t]).length === 1);
});

/* ----------------------------------- CSV ----------------------------------- */

test('CSV parsing handles quotes, embedded commas and a BOM', () => {
  const rows = parseCSV('﻿a,b\n"x,1","he said ""hi"""\n');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['x,1', 'he said "hi"'],
  ]);
});

test('CSV parsing detects a semicolon delimiter', () => {
  assert.deepEqual(parseCSV('a;b\n1;2'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('CSV export neutralises formula injection', () => {
  const out = toCSV([['=cmd()', 'plain']]);
  assert.ok(out.startsWith("'=cmd()"), out);
});

test('CSV import maps headers and infers direction', () => {
  const rows = parseCSV('Date,Description,Amount\n2026-03-01,Coffee,-4.50\n2026-03-02,Salary,3000');
  const mapping = guessMapping(rows[0]);
  assert.equal(mapping.date, 0);
  assert.equal(mapping.description, 1);
  assert.equal(mapping.amount, 2);
  const { transactions, skipped } = rowsToTransactions(rows, mapping, { hasHeader: true, makeId: () => `i${++n}` });
  assert.equal(skipped, 0);
  assert.equal(transactions[0].type, 'expense');
  assert.equal(transactions[0].amount, 4.5);
  assert.equal(transactions[1].type, 'income');
});

test('an all-positive single-column file is treated as spending', () => {
  const rows = parseCSV('Date,Description,Amount\n2026-03-01,Coffee,4.50\n2026-03-02,Lunch,12');
  const mapping = guessMapping(rows[0]);
  const { transactions } = rowsToTransactions(rows, mapping, { hasHeader: true, makeId: () => `j${++n}` });
  assert.ok(transactions.every((t) => t.type === 'expense'));
});

test('unreadable rows are reported, not silently dropped', () => {
  const rows = parseCSV('Date,Description,Amount\nnot-a-date,Coffee,4.50\n2026-03-02,Lunch,12');
  const mapping = guessMapping(rows[0]);
  const result = rowsToTransactions(rows, mapping, { hasHeader: true, makeId: () => `k${++n}` });
  assert.equal(result.skipped, 1);
  assert.equal(result.transactions.length, 1);
  assert.ok(result.problems.length > 0);
});

test('duplicate detection matches on date, amount and merchant', () => {
  const existing = [txn({ date: '2026-03-01', amount: 4.5, description: 'Coffee' })];
  const incoming = [
    txn({ id: 'x', date: '2026-03-01', amount: 4.5, description: 'Coffee' }),
    txn({ id: 'y', date: '2026-03-01', amount: 9, description: 'Coffee' }),
  ];
  const dupes = findDuplicates(incoming, existing);
  assert.ok(dupes.has('x'));
  assert.ok(!dupes.has('y'));
});

test('two identical charges in one file are both real', () => {
  // A phone top-up bought twice a minute apart. Dropping the second would
  // understate the month.
  const incoming = [
    txn({ id: 'a', date: '2026-09-01', amount: 78.57, description: 'Etisalat Top-Up' }),
    txn({ id: 'b', date: '2026-09-01', amount: 78.57, description: 'Etisalat Top-Up' }),
  ];
  assert.equal(findDuplicates(incoming, []).size, 0);
  // Re-importing the same file, though, must not double them.
  assert.equal(findDuplicates(incoming, incoming).size, 2);
});

test('periodLabel names a whole month, and both ends of anything else', () => {
  assert.equal(periodLabel({ from: '2026-03-01', to: '2026-03-31' }, 'en-US', 1), 'March 2026');
  assert.equal(periodLabel({ from: '2025-07-01', to: '2026-09-12' }, 'en-US', 1), 'Jul 1, 2025 – Sep 12, 2026');
  assert.equal(periodLabel({ from: '2026-02-25', to: '2026-03-24' }, 'en-US', 25), 'Feb 25 – Mar 24, 2026');
});

test('month buckets carry a year once the window crosses one', () => {
  const rows = [txn({ date: '2025-08-04', amount: 10 })];
  const oneYear = timeSeries(rows, { from: '2026-01-01', to: '2026-06-30' }, 'month', S);
  assert.equal(oneYear[0].label, 'Jan');
  const across = timeSeries(rows, { from: '2025-08-01', to: '2026-02-28' }, 'month', S);
  assert.match(across[0].label, /Aug\s?'?25/, across[0].label);
});

test('the all-time preset is bounded by the data', () => {
  const rows = [txn({ date: '2025-11-02' }), txn({ date: '2026-02-14' })];
  const all = presetRanges(1, earliestDate(rows)).find((p) => p.id === 'all')!;
  assert.equal(all.range.from, '2025-11-02');
  assert.ok(all.range.to <= todayISO());
  // An empty ledger must still produce a sane, finite window.
  const empty = presetRanges(1, earliestDate([])).find((p) => p.id === 'all')!;
  assert.ok(daysBetween(empty.range.from, empty.range.to) < 800);
});

test('money survives a nonsense currency code', () => {
  const out = money(12.5, { currency: 'NOTACURRENCY', locale: 'en-US' });
  assert.match(out, /12\.5/);
  assert.match(out, /NOTACURRENCY/);
});

test('the running line stops at today, not at a future month end', () => {
  const rows = [txn({ date: '2026-03-02', amount: 30 })];
  const flow = cashflow(rows, { from: '2026-03-01', to: '2026-03-31' }, '2026-03-05');
  assert.equal(flow.length, 5);
  assert.equal(flow[flow.length - 1].date, '2026-03-05');
  // A window entirely in the past still runs to its own end.
  const past = cashflow(rows, { from: '2026-01-01', to: '2026-01-10' }, '2026-03-05');
  assert.equal(past[past.length - 1].date, '2026-01-10');
});

test('a currency column in an import is adopted', () => {
  const rows = parseCSV('Date,Merchant,Amount (EGP),Currency\n2026-09-01,Talabat,138,EGP\n2026-09-02,Telda,1313,EGP');
  const mapping = guessMapping(rows[0]);
  const result = rowsToTransactions(rows, mapping, { hasHeader: true, makeId: () => `c${++n}` });
  assert.equal(result.currency, 'EGP');
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].amount, 138);
});

test('a spend-only export adopts its own categories, currency and cards', () => {
  const rows = [
    txn({ category: 'Food Delivery & Dining', account: 'CIB' }),
    txn({ category: 'Food Delivery & Dining', account: 'CIB' }),
    txn({ category: 'Telecom & Bills', account: 'Banque Misr' }),
    txn({ category: 'Baby & Children Supplies', account: 'CIB' }),
  ];
  const config = configFromSheet(DEFAULT_CONFIG, rows, 'EGP');

  assert.equal(config.settings.currency, 'EGP');
  assert.deepEqual(config.settings.accounts, ['Banque Misr', 'CIB']);

  const names = config.categories.map((c) => c.name);
  assert.ok(names.includes('Food Delivery & Dining'));
  assert.ok(names.includes('Telecom & Bills'));
  assert.ok(!names.includes('Groceries'), "our own taxonomy shouldn't clutter theirs");

  // The most-used categories must not share a hue, or the donut misleads.
  const top = config.categories.slice(0, 3).map((c) => c.slot);
  assert.equal(new Set(top).size, 3);

  // Guessed groups and icons should be sensible, not all the fallback.
  const food = config.categories.find((c) => c.name === 'Food Delivery & Dining')!;
  assert.equal(food.icon, '🍽️');
});

test('a sheet without its own categories keeps the defaults', () => {
  const rows = [txn({ category: '' }), txn({ category: 'Uncategorized' })];
  assert.equal(configFromSheet(DEFAULT_CONFIG, rows).categories, DEFAULT_CATEGORIES);
});

test('a category that appears later is adopted without disturbing the rest', () => {
  const base = { ...DEFAULT_CONFIG, categories: configFromSheet(DEFAULT_CONFIG, [txn({ category: 'Fuel & Automotive' })]).categories };
  assert.equal(newCategories(base, [txn({ category: 'Fuel & Automotive' })]).length, 0, 'no write when nothing is new');
  const added = newCategories(base, [txn({ category: 'Healthcare & Pharmacy' })]);
  assert.equal(added.length, 1);
  assert.equal(added[0].name, 'Healthcare & Pharmacy');
  assert.equal(added[0].icon, '🩺');
});

test('category guessing is not fooled by keywords hiding inside longer words', () => {
  const icon = (name: string) => configFromSheet(DEFAULT_CONFIG, [txn({ category: name })]).categories[0].icon;
  // Each of these used to hit the wrong rule.
  assert.equal(icon('Healthcare & Pharmacy'), '🩺', 'not fuel, via "car" in Healthcare');
  assert.equal(icon('Coffee Shops'), '🍽️', 'not bank fees, via "fee" in Coffee');
  assert.equal(icon('Taxi & Ride Hailing'), '🚗', 'not taxes, via "tax" in Taxi');
  assert.equal(icon('Petrol Stations'), '⛽', 'not pets, via "pet" in Petrol');
  assert.equal(icon('Thai Food'), '🍽️', 'not AI subscriptions, via "ai" in Thai');
  assert.equal(icon('Current Account Charges'), '🏦', 'not rent, via "rent" in Current');
  // And the ones it should still get right.
  assert.equal(icon('Fuel & Automotive'), '⛽');
  assert.equal(icon('Digital Subscriptions & AI'), '🔁');
  assert.equal(icon('Financial & Wallet Transfers'), '↔️');
  assert.equal(icon('Baby & Children Supplies'), '🧸');
  assert.equal(icon('Telecom & Bills'), '📶');
  assert.equal(icon('Gaming & Entertainment'), '🎮');
  assert.equal(icon('Retail & Shopping'), '🛍️');
});

test('the folded "Other" slice knows which categories it stands for', () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    txn({ amount: 100 - i, category: `Cat${String(i).padStart(2, '0')}` }),
  );
  const slices = byCategory(rows, DEFAULT_CATEGORIES, null, { limit: 5 });
  const other = slices.find((s) => s.name === 'Other')!;

  // Filtering on the literal label would match nothing — the members are what
  // the drill-through actually uses.
  assert.ok(!rows.some((t) => t.category === 'Other'));
  assert.equal(other.members.length, 8, 'the 8 folded categories');
  assert.equal(
    applyFilter(rows, { ...EMPTY_FILTER, categories: other.members }).length,
    8,
    'clicking Other must find its transactions',
  );

  // A normal slice stands for exactly itself.
  const top = slices[0];
  assert.deepEqual(top.members, [top.name]);
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, categories: top.members }).length, 1);

  // And the folded rows account for exactly the Other total.
  const foldedTotal = applyFilter(rows, { ...EMPTY_FILTER, categories: other.members })
    .reduce((s, t) => s + t.amount, 0);
  assert.equal(foldedTotal, other.value);
});

import { addDays, todayISO, toISO, fromISO } from './dates';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, UNCATEGORIZED } from './defaults';
import type { AppConfig, Bootstrap, Transaction } from './types';

/**
 * Deterministic sample ledger so the app is fully explorable before anyone
 * connects a sheet. Seeded PRNG — same data every load, which makes the demo
 * screenshots and the "does this number look right?" check reproducible.
 */
function mulberry32(seed: number) {
  return function rand(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  merchant: string;
  category: string;
  min: number;
  max: number;
  /** Expected charges per month, on top of any fixed weekdays. */
  freq: number;
  /** Weekdays (0 = Sunday) this always lands on — the weekly grocery run, etc. */
  onDays?: number[];
  account?: string;
  member?: string;
}

const SPECS: Spec[] = [
  // The weekly shop and the commute are pinned to weekdays so even a
  // part-finished month looks like a real one.
  { merchant: 'WHOLE FOODS MKT #3821', category: 'Groceries', min: 38, max: 190, freq: 2, onDays: [6] },
  { merchant: 'TRADER JOES 442', category: 'Groceries', min: 22, max: 95, freq: 1, onDays: [3] },
  { merchant: 'SHELL OIL 574122', category: 'Fuel', min: 32, max: 78, freq: 1, onDays: [1] },
  { merchant: 'UBER *TRIP', category: 'Transport', min: 8, max: 44, freq: 4, onDays: [2, 4] },
  { merchant: 'STARBUCKS STORE 09112', category: 'Dining', min: 4, max: 19, freq: 7 },
  { merchant: 'CHIPOTLE 2213', category: 'Dining', min: 12, max: 38, freq: 3 },
  { merchant: 'DOORDASH*ORDER', category: 'Dining', min: 21, max: 72, freq: 3 },
  { merchant: 'AMAZON.COM*2K4L5X', category: 'Shopping', min: 12, max: 240, freq: 5 },
  { merchant: 'TARGET T-1180', category: 'Shopping', min: 18, max: 165, freq: 2 },
  { merchant: 'CVS/PHARMACY #4471', category: 'Health', min: 9, max: 88, freq: 2 },
  { merchant: 'HOME DEPOT 6612', category: 'Home', min: 15, max: 320, freq: 1 },
  { merchant: 'IKEA BROOKLYN', category: 'Home', min: 40, max: 410, freq: 0.4 },
  { merchant: 'AMC THEATRES 8814', category: 'Entertainment', min: 24, max: 62, freq: 0.8 },
  { merchant: 'PETCO 1207', category: 'Home', min: 20, max: 90, freq: 0.8 },
  { merchant: 'SEPHORA #221', category: 'Personal Care', min: 25, max: 140, freq: 0.7 },
  { merchant: 'DELTA AIR 0062218', category: 'Travel', min: 180, max: 720, freq: 0.25 },
  { merchant: 'MARRIOTT HOTELS', category: 'Travel', min: 160, max: 480, freq: 0.2 },
  { merchant: 'BRIGHT HORIZONS TUITION', category: 'Kids', min: 380, max: 420, freq: 1 },
];

/** Charged on a fixed day each month — the subscription detector should find these. */
const SUBSCRIPTIONS: { merchant: string; category: string; amount: number; day: number }[] = [
  { merchant: 'NETFLIX.COM', category: 'Subscriptions', amount: 22.99, day: 4 },
  { merchant: 'SPOTIFY USA', category: 'Subscriptions', amount: 19.99, day: 9 },
  { merchant: 'APPLE.COM/BILL', category: 'Subscriptions', amount: 12.99, day: 17 },
  { merchant: 'ADOBE CREATIVE CLOUD', category: 'Subscriptions', amount: 59.99, day: 22 },
  { merchant: 'PLANET FITNESS', category: 'Personal Care', amount: 24.99, day: 6 },
  { merchant: 'VERIZON WIRELESS PMT', category: 'Internet & Phone', amount: 148.32, day: 12 },
  { merchant: 'CON EDISON UTILITY', category: 'Utilities', amount: 0, day: 15 },
  { merchant: 'STATE FARM INSURANCE', category: 'Insurance', amount: 164.5, day: 2 },
  { merchant: 'GREENVIEW PROPERTIES RENT', category: 'Rent', amount: 2450, day: 1 },
];

const ACCOUNTS = ['Visa •4412', 'Amex •1007', 'Debit •8830'];
const MEMBERS = ['Me', 'Partner', 'Joint'];

export function makeDemoTransactions(months = 14): Transaction[] {
  const rand = mulberry32(20260912);
  const out: Transaction[] = [];
  const today = todayISO();
  const start = (() => {
    const d = fromISO(today);
    d.setMonth(d.getMonth() - months);
    d.setDate(1);
    return toISO(d);
  })();

  let n = 0;
  const id = () => `demo_${(++n).toString(36).padStart(4, '0')}`;
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const round2 = (v: number) => Math.round(v * 100) / 100;

  for (let day = start; day <= today; day = addDays(day, 1)) {
    const d = fromISO(day);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    // Salary on the 1st and 16th, with a slow raise over time.
    if (d.getDate() === 1 || d.getDate() === 16) {
      const monthsIn = (fromISO(day).getFullYear() - fromISO(start).getFullYear()) * 12 + fromISO(day).getMonth() - fromISO(start).getMonth();
      out.push(base(id(), day, 'ACME CORP PAYROLL DIRECT DEP', round2(3120 + monthsIn * 14), 'income', 'Salary', 'Debit •8830', 'Me'));
    }
    if (d.getDate() === 5) {
      out.push(base(id(), day, 'NORTHWIND STUDIO PAYOUT', round2(1850 + rand() * 340), 'income', 'Salary', 'Debit •8830', 'Partner'));
    }

    // Monthly fixed charges.
    for (const s of SUBSCRIPTIONS) {
      if (d.getDate() !== s.day) continue;
      // The utility bill swings with the season — it should read as "varies".
      const amount = s.amount || round2(96 + Math.abs(Math.sin((d.getMonth() / 12) * Math.PI * 2)) * 118);
      out.push(base(id(), day, s.merchant, amount, 'expense', s.category, s.merchant.includes('RENT') ? 'Debit •8830' : 'Visa •4412', 'Joint'));
    }

    // Monthly transfer to savings.
    if (d.getDate() === 17) {
      out.push(base(id(), day, 'TRANSFER TO SAVINGS 9921', 600, 'transfer', 'Transfer', 'Debit •8830', 'Joint'));
    }

    // Everyday spend.
    for (const spec of SPECS) {
      const daily = spec.freq / 30.44;
      const boost = isWeekend && ['Dining', 'Entertainment', 'Shopping'].includes(spec.category) ? 1.7 : 1;
      const pinned = spec.onDays?.includes(d.getDay()) ?? false;
      if (!pinned && rand() > daily * boost) continue;
      const amount = round2(spec.min + rand() * (spec.max - spec.min));
      out.push(
        base(
          id(),
          day,
          spec.merchant,
          amount,
          'expense',
          spec.category,
          spec.account ?? pick(ACCOUNTS),
          spec.member ?? pick(MEMBERS),
        ),
      );
    }

    // A few genuinely unclassified rows, so the triage flows have something to do.
    if (rand() < 0.045) {
      out.push(
        base(
          id(),
          day,
          pick(['SQ *THE CORNER SHOP', 'PAYPAL *MRKTPLACE', 'POS 8811 MERCHANT', 'SUMUP *KIOSK']),
          round2(6 + rand() * 120),
          'expense',
          UNCATEGORIZED,
          pick(ACCOUNTS),
          pick(MEMBERS),
        ),
      );
    }

    // Occasional refund.
    if (rand() < 0.012) {
      out.push(base(id(), day, 'AMAZON.COM REFUND', round2(12 + rand() * 90), 'income', 'Other Income', 'Visa •4412', pick(MEMBERS)));
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function base(
  id: string,
  date: string,
  description: string,
  amount: number,
  type: Transaction['type'],
  category: string,
  account: string,
  member: string,
): Transaction {
  return {
    id,
    date,
    description,
    amount,
    type,
    category,
    account,
    member,
    notes: '',
    tags: [],
    excluded: false,
    cleared: false,
    source: 'sheet',
  };
}

export function demoConfig(): AppConfig {
  const byName = (n: string) => DEFAULT_CATEGORIES.find((c) => c.name === n)!.id;
  return {
    settings: { ...DEFAULT_SETTINGS, accounts: ACCOUNTS, members: MEMBERS, largeAmount: 400 },
    categories: DEFAULT_CATEGORIES,
    budgets: [
      { id: 'b1', categoryId: byName('Groceries'), amount: 900, rollover: false },
      { id: 'b2', categoryId: byName('Dining'), amount: 450, rollover: false },
      { id: 'b3', categoryId: byName('Shopping'), amount: 400, rollover: true },
      { id: 'b4', categoryId: byName('Transport'), amount: 220, rollover: false },
      { id: 'b5', categoryId: byName('Fuel'), amount: 200, rollover: false },
      { id: 'b6', categoryId: byName('Entertainment'), amount: 150, rollover: true },
      { id: 'b7', categoryId: byName('Personal Care'), amount: 180, rollover: false },
    ],
    goals: [
      { id: 'g1', name: 'Emergency fund', target: 20000, saved: 12400, slot: 3, note: 'Six months of core spend' },
      { id: 'g2', name: 'Japan trip', target: 6500, saved: 2150, targetDate: nextSpring(), slot: 5 },
      { id: 'g3', name: 'New car deposit', target: 12000, saved: 3600, slot: 1 },
    ],
    rules: [
      {
        id: 'r1',
        name: 'Starbucks → Dining',
        enabled: true,
        conditions: [{ field: 'description', op: 'contains', value: 'STARBUCKS' }],
        actions: { category: 'Dining', renameTo: 'Starbucks' },
      },
      {
        id: 'r2',
        name: 'Transfers are not spending',
        enabled: true,
        conditions: [{ field: 'description', op: 'contains', value: 'TRANSFER TO' }],
        actions: { type: 'transfer', category: 'Transfer' },
      },
    ],
  };
}

function nextSpring(): string {
  const d = new Date();
  return `${d.getFullYear() + 1}-04-15`;
}

export function demoBootstrap(): Bootstrap {
  const transactions = makeDemoTransactions();
  return {
    transactions,
    config: demoConfig(),
    meta: {
      spreadsheetName: 'Card Transactions (sample data)',
      sheetName: 'Transactions',
      headers: ['Date', 'Description', 'Amount', 'Category', 'Card', 'Notes'],
      mapping: {
        date: 'Date',
        description: 'Description',
        amount: 'Amount',
        type: '',
        category: 'Category',
        account: 'Card',
        member: '',
        notes: 'Notes',
        tags: '',
        excluded: '',
        cleared: '',
      },
      rowCount: transactions.length,
      revision: 1,
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

import { DEFAULT_CATEGORIES, UNCATEGORIZED, categoryByName } from './defaults';
import type { AppConfig, Category, CategoryGroup, Transaction } from './types';

/**
 * Making someone else's categories our own.
 *
 * A sheet built by an automation usually arrives already categorized, in that
 * tool's own taxonomy — "Food Delivery & Dining", "Telecom & Bills". Those names
 * are the ones the person recognises, so the app adopts them rather than asking
 * anyone to re-map their data onto a list we invented.
 */

interface Guess {
  group: CategoryGroup;
  icon: string;
  match: RegExp;
}

/**
 * Keyword guesses for a category's group and icon. First match wins.
 *
 * Short keywords need word boundaries or they quietly match the wrong thing:
 * "car" is inside "Healthcare", "fee" inside "Coffee", "tax" inside "Taxi",
 * "pet" inside "Petrol", "ai" inside "Thai", "rent" inside "Current".
 */
const GUESSES: Guess[] = [
  { match: /transfer|wallet|remittance/i, group: 'transfer', icon: '↔️' },
  { match: /salary|payroll|income|wages?/i, group: 'income', icon: '💰' },
  { match: /saving|invest|deposit/i, group: 'savings', icon: '🐖' },
  { match: /grocer|supermarket|hypermarket/i, group: 'needs', icon: '🛒' },
  { match: /food|dining|restaurant|cafe|coffee|delivery|takeaway/i, group: 'wants', icon: '🍽️' },
  { match: /health|pharmac|medical|clinic|doctor|dental|hospital/i, group: 'needs', icon: '🩺' },
  { match: /fuel|petrol|gasoline|automotive|\bcars?\b|vehicle/i, group: 'needs', icon: '⛽' },
  { match: /transport|taxi|\brides?\b|uber|commut|metro|parking/i, group: 'needs', icon: '🚗' },
  { match: /travel|flight|airline|hotel|holiday/i, group: 'wants', icon: '✈️' },
  { match: /telecom|mobile|phone|internet|\bbills?\b|utilit|electric|\bwater\b/i, group: 'needs', icon: '📶' },
  { match: /baby|child|\bkids?\b|school|educat|nursery|tuition/i, group: 'needs', icon: '🧸' },
  { match: /subscription|streaming|software|digital|\bai\b/i, group: 'wants', icon: '🔁' },
  { match: /gaming|entertain|movie|cinema|music|\bgames?\b/i, group: 'wants', icon: '🎮' },
  { match: /shopping|retail|clothing|fashion|apparel|\bstores?\b/i, group: 'wants', icon: '🛍️' },
  { match: /\brent\b|rental|mortgage|housing|accommodation/i, group: 'needs', icon: '🏠' },
  { match: /insur|takaful/i, group: 'needs', icon: '🛡️' },
  { match: /\bfees?\b|interest|banking|financial|\bcharges?\b|\baccount\b/i, group: 'needs', icon: '🏦' },
  { match: /\btax(es)?\b|government|customs/i, group: 'needs', icon: '🧾' },
  { match: /gift|charit|donat|zakat|sadaqa/i, group: 'wants', icon: '🎁' },
  { match: /beauty|personal care|salon|barber|grooming|cosmetic/i, group: 'wants', icon: '💇' },
  { match: /\bhome\b|furnitur|hardware|repair|maintenance|household/i, group: 'needs', icon: '🧰' },
  { match: /\bpets?\b|\bvet\b|veterinar/i, group: 'needs', icon: '🐾' },
  { match: /fitness|\bgym\b|sports?/i, group: 'wants', icon: '🏋️' },
];

function guess(name: string): { group: CategoryGroup; icon: string } {
  for (const g of GUESSES) if (g.match.test(name)) return { group: g.group, icon: g.icon };
  return { group: 'wants', icon: '🏷️' };
}

function toId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, '-')
      .replace(/^-|-$/g, '') || `cat-${Math.abs(hash(name))}`
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

/** Category names in the data, most used first. */
export function categoryNamesInUse(transactions: Transaction[]): string[] {
  const counts = new Map<string, number>();
  for (const t of transactions) {
    const name = (t.category || '').trim();
    if (!name || name === UNCATEGORIZED) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** Share of rows that arrived with a category already on them. */
export function categorizedShare(transactions: Transaction[]): number {
  if (!transactions.length) return 0;
  let n = 0;
  for (const t of transactions) {
    const name = (t.category || '').trim();
    if (name && name !== UNCATEGORIZED) n++;
  }
  return n / transactions.length;
}

function build(name: string, slot: number): Category {
  const { group, icon } = guess(name);
  return { id: toId(name), name, group, slot, icon };
}

/**
 * The category list to use on a first connection.
 *
 * When the sheet already categorizes most of its rows, its own names *are* the
 * taxonomy — showing our 26 invented ones alongside would be noise in every
 * picker. When it doesn't, our defaults are the better starting point.
 * Palette slots are handed out in order of how much each category is used, so
 * the biggest slices of the donut always get distinct hues.
 */
export function initialCategories(transactions: Transaction[]): Category[] {
  const names = categoryNamesInUse(transactions);
  if (!names.length || categorizedShare(transactions) < 0.5) return DEFAULT_CATEGORIES;

  const adopted = names.map((name, i) => build(name, (i % 8) + 1));
  const uncategorized = DEFAULT_CATEGORIES.find((c) => c.name === UNCATEGORIZED)!;
  return [...adopted, uncategorized];
}

/**
 * Categories that appeared in the data but aren't in the config yet — a new one
 * from the automation, or a name typed straight into the spreadsheet. Returns
 * an empty array when there is nothing to add, so callers can skip the write.
 */
export function newCategories(config: AppConfig, transactions: Transaction[]): Category[] {
  const taken = new Set(config.categories.map((c) => c.slot));
  let next = 1;
  const nextSlot = (): number => {
    // Prefer a hue nothing else is using before repeating one.
    for (let i = 0; i < 8; i++) {
      const slot = ((next + i - 1) % 8) + 1;
      if (!taken.has(slot)) {
        taken.add(slot);
        next = slot + 1;
        return slot;
      }
    }
    const slot = ((next - 1) % 8) + 1;
    next = slot + 1;
    return slot;
  };

  const added: Category[] = [];
  for (const name of categoryNamesInUse(transactions)) {
    if (categoryByName(config.categories, name)) continue;
    if (added.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
    added.push(build(name, nextSlot()));
  }
  return added;
}

/**
 * Adapts a fresh config to whatever the sheet actually contains: its categories,
 * its currency, and the cards it uses. Only ever called when the sheet has no
 * saved settings of its own, so it can never overwrite a real choice.
 */
export function configFromSheet(
  base: AppConfig,
  transactions: Transaction[],
  detectedCurrency?: string,
): AppConfig {
  const accounts = [...new Set(transactions.map((t) => t.account).filter(Boolean))].sort();
  const currency = (detectedCurrency || '').trim().toUpperCase();

  return {
    ...base,
    categories: initialCategories(transactions),
    settings: {
      ...base.settings,
      ...(currency.length === 3 ? { currency } : {}),
      accounts: accounts.length ? accounts : base.settings.accounts,
    },
  };
}

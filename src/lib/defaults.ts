import type { AppConfig, Category, Settings } from './types';

/** The validated categorical palette, light then dark. Index 0 = slot 1. */
export const SERIES_VARS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'] as const;

/** CSS colour for a category slot (1-8). Slots beyond 8 fold back — see `foldSeries`. */
export function slotColor(slot: number): string {
  const i = Math.max(1, Math.min(8, Math.round(slot))) - 1;
  return `var(${SERIES_VARS[i]})`;
}

/** Neutral used for the "Other" bucket, so it never impersonates a real series. */
export const OTHER_COLOR = 'rgb(var(--muted))';

export const UNCATEGORIZED = 'Uncategorized';

const cat = (name: string, group: Category['group'], slot: number, icon: string): Category => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  group,
  slot,
  icon,
});

export const DEFAULT_CATEGORIES: Category[] = [
  cat('Groceries', 'needs', 3, '🛒'),
  cat('Dining', 'wants', 2, '🍽️'),
  cat('Transport', 'needs', 1, '🚗'),
  cat('Fuel', 'needs', 4, '⛽'),
  cat('Rent', 'needs', 7, '🏠'),
  cat('Utilities', 'needs', 5, '💡'),
  cat('Internet & Phone', 'needs', 1, '📶'),
  cat('Health', 'needs', 8, '🩺'),
  cat('Insurance', 'needs', 1, '🛡️'),
  cat('Shopping', 'wants', 5, '🛍️'),
  cat('Subscriptions', 'wants', 7, '🔁'),
  cat('Entertainment', 'wants', 2, '🎬'),
  cat('Travel', 'wants', 2, '✈️'),
  cat('Kids', 'needs', 6, '🧸'),
  cat('Education', 'needs', 5, '📚'),
  cat('Gifts & Charity', 'wants', 4, '🎁'),
  cat('Personal Care', 'wants', 5, '💇'),
  cat('Home', 'needs', 4, '🧰'),
  cat('Fees & Interest', 'needs', 8, '🏦'),
  cat('Taxes', 'needs', 8, '🧾'),
  cat('Savings', 'savings', 6, '🐖'),
  cat('Investments', 'savings', 6, '📈'),
  cat('Salary', 'income', 6, '💰'),
  cat('Other Income', 'income', 6, '💵'),
  cat('Transfer', 'transfer', 1, '↔️'),
  cat(UNCATEGORIZED, 'wants', 1, '❓'),
];

export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  locale: 'en-US',
  monthStartDay: 1,
  weekStart: 1,
  members: ['Me', 'Partner', 'Joint'],
  accounts: [],
  theme: 'system',
  privacy: false,
  pollSeconds: 120,
  archiveOnDelete: true,
  largeAmount: 500,
};

export const DEFAULT_CONFIG: AppConfig = {
  settings: DEFAULT_SETTINGS,
  categories: DEFAULT_CATEGORIES,
  budgets: [],
  goals: [],
  rules: [],
};

/** Currencies offered in Settings. Anything else can be typed in. */
export const COMMON_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD',
  'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY', 'CNY', 'INR', 'PKR', 'TRY',
  'ZAR', 'NGN', 'KES', 'BRL', 'MXN', 'SGD', 'MYR', 'IDR', 'PHP', 'THB', 'NZD',
];

export const COMMON_LOCALES = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'en-AE', label: 'English (Gulf)' },
  { id: 'ar-SA', label: 'العربية (السعودية)' },
  { id: 'ar-EG', label: 'العربية (مصر)' },
  { id: 'fr-FR', label: 'Français' },
  { id: 'de-DE', label: 'Deutsch' },
  { id: 'es-ES', label: 'Español' },
  { id: 'tr-TR', label: 'Türkçe' },
  { id: 'hi-IN', label: 'हिन्दी' },
];

export function categoryByName(categories: Category[], name: string): Category | undefined {
  const n = (name || '').trim().toLowerCase();
  return categories.find((c) => c.name.toLowerCase() === n);
}

export function categoryColor(categories: Category[], name: string): string {
  const c = categoryByName(categories, name);
  if (!c || c.name === UNCATEGORIZED) return OTHER_COLOR;
  return slotColor(c.slot);
}

/**
 * The palette slot a category paints with, or 0 for the neutral "Other"/
 * uncategorized bucket. Charts use this to order marks — see `DonutChart`.
 */
export function categorySlot(categories: Category[], name: string): number {
  const c = categoryByName(categories, name);
  if (!c || c.name === UNCATEGORIZED) return 0;
  return c.slot;
}

export function categoryIcon(categories: Category[], name: string): string {
  return categoryByName(categories, name)?.icon ?? '❓';
}

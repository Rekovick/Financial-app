import type { Settings } from './types';

const fmtCache = new Map<string, Intl.NumberFormat>();

function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, opts);
    } catch {
      // An unknown currency or locale — from hand-edited config, or an older
      // browser — must degrade to plain numbers, never take a page down.
      const { style, currency, ...rest } = opts;
      void style;
      void currency;
      f = new Intl.NumberFormat('en-US', rest);
    }
    fmtCache.set(key, f);
  }
  return f;
}

export function money(
  value: number,
  s: Pick<Settings, 'currency' | 'locale'>,
  opts: { compact?: boolean; sign?: boolean; decimals?: 0 | 2 } = {},
): string {
  const abs = Math.abs(value);
  const decimals = opts.decimals ?? (opts.compact && abs >= 1000 ? 0 : 2);
  const body = nf(s.locale, {
    style: 'currency',
    currency: s.currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    notation: opts.compact && abs >= 100_000 ? 'compact' : 'standard',
  }).format(opts.sign ? value : abs);
  // When the currency was rejected above, the formatter drops the symbol —
  // put the code back so a number is never ambiguous.
  const withSymbol = /[^\d\s.,+-]/.test(body) ? body : `${body} ${s.currency}`;
  if (opts.sign && value > 0 && !withSymbol.startsWith('+')) return `+${withSymbol}`;
  return withSymbol;
}

/** Short form for axis ticks: 1.2k, 340, 1.1M. Never currency-symboled. */
export function compactNumber(value: number, locale = 'en-US'): string {
  const abs = Math.abs(value);
  if (abs < 1000) return nf(locale, { maximumFractionDigits: abs < 10 ? 1 : 0 }).format(value);
  return nf(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function percent(value: number, locale = 'en-US', decimals = 0): string {
  return nf(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function currencySymbol(currency: string, locale = 'en-US'): string {
  try {
    const parts = nf(locale, { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Parses whatever a human types into an amount box: "1,234.50", "١٢٣", "(45)", "45-". */
export function parseAmount(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Arabic-Indic and Eastern Arabic-Indic digits → ASCII.
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-\s*$/, '');
  }

  // Strip currency symbols, letters (SAR, USD, AED…) and spaces.
  s = s.replace(/[^\d.,\-+]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^\+/, '');
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal one.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // A lone comma with 1-2 trailing digits is a decimal comma ("1,25");
    // anything else is thousands grouping ("1,250", "1,234,567").
    const tail = s.length - lastComma - 1;
    const commas = (s.match(/,/g) as string[] | null)?.length ?? 0;
    s = commas === 1 && tail !== 3 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(/,/g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Turn "AMAZON.COM*2K4L5 SEATTLE WA" into "Amazon.com". Best-effort, never lossy. */
export function prettyMerchant(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/\s+/g, ' ');
  // Drop common processor noise.
  const stripped = s.replace(/^(POS|PURCHASE|PAYMENT|CARD|VISA|MC|MASTERCARD|DEBIT|CREDIT)[\s:*-]+/i, '');
  if (stripped !== s) {
    // "POS 8811 MERCHANT" — whatever followed the processor tag is a terminal
    // number, not the shop's name. Only ever dropped right after such a tag, so
    // "7 Eleven" and "99 Ranch" keep their leading digits.
    s = stripped.replace(/^\d{3,}\s+/, '');
  }
  s = s.replace(/\b(?:\d{2}\/\d{2}(?:\/\d{2,4})?)\b/g, '');
  s = s.replace(/[*#]\s?[A-Z0-9]{4,}\b/gi, '');
  s = s.replace(/\b[A-Z0-9]{10,}\b/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/[\s\-*_.]+$/, '');
  if (!s) return raw.trim();
  // Title-case only if it's screaming. Word boundaries are whitespace, hyphens
  // and slashes — never a dot, or "AMAZON.COM" would come out "Amazon.Com".
  if (s === s.toUpperCase()) {
    s = s
      .toLowerCase()
      .replace(/(^|[\s\-/])([a-z؀-ۿ])/g, (_m, p, c) => p + c.toUpperCase());
  }
  return s;
}

/**
 * Collapses a description to a merchant key so repeat charges group together.
 * Store and terminal numbers are dropped: "STARBUCKS STORE 09112" and
 * "STARBUCKS STORE 44120" are the same merchant, and keeping the digits would
 * split every chain into dozens of one-offs and hide real subscriptions from
 * the recurring detector.
 */
export function merchantKey(description: string): string {
  return prettyMerchant(description)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !/^\d+$/.test(word))
    .slice(0, 3)
    .join(' ');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

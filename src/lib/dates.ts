import type { DateRange } from './types';

export const ISO = 'yyyy-MM-dd';

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses a date-only ISO string in *local* time — never UTC, which shifts the day. */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: string, n: number): string {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // Clamp for short months: Jan 31 + 1 month → Feb 28/29.
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toISO(d);
}

export function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);
}

/**
 * The financial period containing `iso`, honouring a custom start day.
 * With monthStartDay = 25, 2026-03-04 falls in the 2026-02-25 → 2026-03-24 cycle.
 */
export function periodOf(iso: string, monthStartDay: number): DateRange {
  const d = fromISO(iso);
  const start = new Date(d);
  if (monthStartDay <= 1) {
    start.setDate(1);
  } else {
    const anchor = Math.min(monthStartDay, daysInMonth(d.getFullYear(), d.getMonth()));
    if (d.getDate() < anchor) {
      start.setMonth(start.getMonth() - 1, 1);
      start.setDate(Math.min(monthStartDay, daysInMonth(start.getFullYear(), start.getMonth())));
    } else {
      start.setDate(anchor);
    }
  }
  const from = toISO(start);
  const to = addDays(shiftPeriod(from, 1, monthStartDay), -1);
  return { from, to };
}

/** Move a period start forward/backward by n cycles. */
export function shiftPeriod(fromIso: string, n: number, monthStartDay: number): string {
  const d = fromISO(fromIso);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const day = monthStartDay <= 1 ? 1 : Math.min(monthStartDay, daysInMonth(d.getFullYear(), d.getMonth()));
  d.setDate(day);
  return toISO(d);
}

/**
 * Names a window the way a person would. A window that is exactly one calendar
 * month gets the month's name; anything else gets both ends, because calling a
 * fourteen-month range "July 2025" is worse than saying nothing.
 */
export function periodLabel(range: DateRange, locale = 'en-US', monthStartDay = 1): string {
  const from = fromISO(range.from);
  const to = fromISO(range.to);

  const wholeMonth =
    monthStartDay <= 1 &&
    from.getDate() === 1 &&
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth() &&
    to.getDate() === daysInMonth(to.getFullYear(), to.getMonth());
  if (wholeMonth) return from.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const sameYear = from.getFullYear() === to.getFullYear();
  const a = from.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const b = to.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${a} – ${b}`;
}

export function inRange(iso: string, r: DateRange | null): boolean {
  if (!r) return true;
  return iso >= r.from && iso <= r.to;
}

export function rangeLength(r: DateRange): number {
  return daysBetween(r.from, r.to) + 1;
}

/** The same-length window immediately before `r` — for period-over-period deltas. */
export function previousRange(r: DateRange): DateRange {
  const len = rangeLength(r);
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export function startOfWeek(iso: string, weekStart: 0 | 1 | 6): string {
  const d = fromISO(iso);
  const diff = (d.getDay() - weekStart + 7) % 7;
  return addDays(iso, -diff);
}

export function formatDate(iso: string, locale = 'en-US', style: 'short' | 'medium' | 'long' | 'day' = 'medium'): string {
  const d = fromISO(iso);
  switch (style) {
    case 'short':
      return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    case 'long':
      return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    case 'day':
      return d.toLocaleDateString(locale, { weekday: 'short' });
    default:
      return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

/** "Today", "Yesterday", "Mon 4 Mar" — the heading above each day's transactions. */
export function relativeDayLabel(iso: string, locale = 'en-US'): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const d = fromISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Best-effort parse of whatever the sheet holds in a date cell:
 * ISO, US, EU, "12 Mar 2026", Excel/Sheets serial numbers, Date objects.
 */
export function coerceDate(value: unknown, preferDMY = false): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return toISO(value);

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Sheets serial: days since 1899-12-30.
    if (value > 20_000 && value < 80_000) {
      const d = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
      return toISO(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
    if (value > 1e11) return toISO(new Date(value));
  }

  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    let day = Number(a);
    let month = Number(b);
    // Disambiguate: >12 in the first slot means it must be the day.
    if (!preferDMY && day <= 12) [day, month] = [month, day];
    if (day > 31) return null;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    if (month < 1 || month > 12) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return toISO(parsed);
  return null;
}

import { create } from 'zustand';
import { EMPTY_FILTER } from './analytics';
import { periodOf, shiftPeriod, todayISO, addDays } from './dates';
import { KEYS, readJSON, readString, writeJSON, writeString } from './storage';
import type { DateRange, Sort, Transaction, TxnFilter } from './types';

type Theme = 'light' | 'dark' | 'system';

export interface UIState {
  /** The global reporting window every page reads from. */
  range: DateRange;
  rangePreset: string;
  theme: Theme;
  privacy: boolean;
  filter: TxnFilter;
  sort: Sort;
  selection: string[];
  editing: Transaction | null;
  quickAddOpen: boolean;
  commandOpen: boolean;
  filtersOpen: boolean;

  setRange: (range: DateRange, preset?: string) => void;
  stepPeriod: (n: number, monthStartDay: number) => void;
  resetPeriod: (monthStartDay: number) => void;
  setTheme: (t: Theme) => void;
  togglePrivacy: () => void;
  setFilter: (patch: Partial<TxnFilter>) => void;
  clearFilter: () => void;
  setSort: (s: Sort) => void;
  toggleSelected: (id: string, additive?: boolean) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;
  setEditing: (t: Transaction | null) => void;
  setQuickAdd: (open: boolean) => void;
  setCommand: (open: boolean) => void;
  setFiltersOpen: (open: boolean) => void;
}

function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  writeString(KEYS.theme, theme);
}

const initialTheme = (readString(KEYS.theme, 'system') || 'system') as Theme;

export const useUI = create<UIState>((set, get) => ({
  range: periodOf(todayISO(), 1),
  rangePreset: 'this',
  theme: initialTheme,
  privacy: false,
  filter: readJSON<TxnFilter>(KEYS.filter, EMPTY_FILTER),
  sort: { key: 'date', dir: 'desc' },
  selection: [],
  editing: null,
  quickAddOpen: false,
  commandOpen: false,
  filtersOpen: false,

  setRange(range, preset = 'custom') {
    set({ range, rangePreset: preset });
  },

  stepPeriod(n, monthStartDay) {
    const from = shiftPeriod(get().range.from, n, monthStartDay);
    const next = periodOf(from, monthStartDay);
    set({ range: next, rangePreset: 'custom' });
  },

  resetPeriod(monthStartDay) {
    set({ range: periodOf(todayISO(), monthStartDay), rangePreset: 'this' });
  },

  setTheme(theme) {
    applyTheme(theme);
    set({ theme });
  },

  togglePrivacy() {
    const privacy = !get().privacy;
    document.body.classList.toggle('private', privacy);
    set({ privacy });
  },

  setFilter(patch) {
    const filter = { ...get().filter, ...patch };
    writeJSON(KEYS.filter, filter);
    set({ filter });
  },

  clearFilter() {
    writeJSON(KEYS.filter, EMPTY_FILTER);
    set({ filter: EMPTY_FILTER });
  },

  setSort(sort) {
    set({ sort });
  },

  toggleSelected(id, additive = true) {
    const cur = get().selection;
    if (!additive) {
      set({ selection: cur.includes(id) && cur.length === 1 ? [] : [id] });
      return;
    }
    set({ selection: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  },

  selectMany(ids) {
    set({ selection: ids });
  },

  clearSelection() {
    set({ selection: [] });
  },

  setEditing(editing) {
    set({ editing });
  },

  setQuickAdd(quickAddOpen) {
    set({ quickAddOpen });
  },

  setCommand(commandOpen) {
    set({ commandOpen });
  },

  setFiltersOpen(filtersOpen) {
    set({ filtersOpen });
  },
}));

/** Called once at boot, after settings are known, to honour the custom cycle. */
export function syncPeriodWithSettings(monthStartDay: number): void {
  const { rangePreset, setRange } = useUI.getState();
  if (rangePreset === 'this') setRange(periodOf(todayISO(), monthStartDay), 'this');
}

export function initTheme(): () => void {
  applyTheme(useUI.getState().theme);
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (useUI.getState().theme === 'system') applyTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** The window immediately before the current one, for "vs last period" reads. */
export function lastNDays(n: number): DateRange {
  const today = todayISO();
  return { from: addDays(today, -(n - 1)), to: today };
}

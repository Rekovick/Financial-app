import { create } from 'zustand';
import { ApiError, PREVIEW_ONLY, api, type Connection } from './api';
import { configFromSheet, newCategories } from './adopt';
import { DEFAULT_CONFIG, UNCATEGORIZED } from './defaults';
import { demoBootstrap } from './demo';
import { makeId } from './id';
import { applyRulesToAll } from './rules';
import { KEYS, readJSON, readString, remove, withinBudget, writeJSON, writeString } from './storage';
import { todayISO } from './dates';
import type {
  AppConfig,
  Bootstrap,
  ConnectionState,
  PendingOp,
  SheetMeta,
  Transaction,
} from './types';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'error';
  /** Optional single action, e.g. "Undo". */
  action?: { label: string; run: () => void };
  duration?: number;
}

interface UndoEntry {
  label: string;
  run: () => Promise<void>;
}

export interface AppState {
  /* connection */
  mode: 'demo' | 'sheet' | 'unset';
  connection: Connection;
  status: ConnectionState;
  error: string | null;
  /* data */
  transactions: Transaction[];
  config: AppConfig;
  meta: SheetMeta | null;
  /* lifecycle */
  loading: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  queue: PendingOp[];
  online: boolean;
  /* ui */
  toasts: Toast[];
  undoStack: UndoEntry[];

  /* actions */
  init: () => void;
  connect: (conn: Connection) => Promise<boolean>;
  disconnect: () => void;
  useDemo: () => void;
  useLocalPreview: () => void;
  adoptFromData: (detectedCurrency?: string) => Promise<number>;
  refresh: (opts?: { quiet?: boolean }) => Promise<void>;
  saveTransactions: (txns: Transaction[], opts?: { label?: string; undoable?: boolean }) => Promise<void>;
  createTransaction: (partial: Partial<Transaction>) => Promise<Transaction>;
  deleteTransactions: (ids: string[]) => Promise<void>;
  patchTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>;
  updateConfig: (patch: Partial<AppConfig>, opts?: { silent?: boolean }) => Promise<void>;
  runRules: () => Promise<number>;
  flushQueue: () => Promise<void>;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  undoLast: () => Promise<void>;
  setOnline: (online: boolean) => void;
}

const EMPTY_CONN: Connection = { url: '', token: '' };

function sortByDate(txns: Transaction[]): Transaction[] {
  return [...txns].sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));
}

/** Merge server rows over local ones, keeping any row only we know about. */
function mergeTransactions(local: Transaction[], incoming: Transaction[]): Transaction[] {
  const map = new Map(local.map((t) => [t.id, t]));
  for (const t of incoming) map.set(t.id, t);
  return sortByDate([...map.values()]);
}

/** Has anyone actually configured this sheet, or is this a first connection? */
function hasSavedConfig(config: Partial<AppConfig> | undefined): boolean {
  return !!config && Array.isArray(config.categories) && config.categories.length > 0;
}

function mergeConfig(config: Partial<AppConfig>): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    settings: { ...DEFAULT_CONFIG.settings, ...config.settings },
  };
}

function cacheSnapshot(state: Pick<AppState, 'transactions' | 'config' | 'meta'>): void {
  if (withinBudget(state.transactions)) writeJSON(KEYS.cacheTxns, state.transactions);
  writeJSON(KEYS.cacheConfig, state.config);
  if (state.meta) writeJSON(KEYS.cacheMeta, state.meta);
}

export const useStore = create<AppState>((set, get) => ({
  mode: 'unset',
  connection: EMPTY_CONN,
  status: 'disconnected',
  error: null,
  transactions: [],
  config: DEFAULT_CONFIG,
  meta: null,
  loading: true,
  syncing: false,
  lastSyncAt: null,
  queue: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  toasts: [],
  undoStack: [],

  init() {
    const mode = readString(KEYS.mode, '') as AppState['mode'] | '';
    const connection = readJSON<Connection>(KEYS.connection, EMPTY_CONN);
    const config = readJSON<AppConfig>(KEYS.cacheConfig, DEFAULT_CONFIG);
    const transactions = readJSON<Transaction[]>(KEYS.cacheTxns, []);
    const meta = readJSON<SheetMeta | null>(KEYS.cacheMeta, null);
    const queue = readJSON<PendingOp[]>(KEYS.queue, []);

    if (mode === 'demo') {
      const boot = demoBootstrap();
      set({
        mode: 'demo',
        status: 'demo',
        transactions: boot.transactions,
        config: { ...boot.config, settings: { ...boot.config.settings, ...config.settings, currency: config.settings?.currency ?? boot.config.settings.currency } },
        meta: boot.meta,
        loading: false,
        lastSyncAt: Date.now(),
      });
      return;
    }

    if (mode === 'sheet' && connection.url) {
      // Show the cached ledger immediately, then refresh behind it.
      set({
        mode: 'sheet',
        connection,
        config,
        transactions: sortByDate(transactions),
        meta,
        queue,
        status: 'connecting',
        loading: transactions.length === 0,
      });
      void get().refresh({ quiet: transactions.length > 0 });
      return;
    }

    if (PREVIEW_ONLY) {
      // Nothing stored yet on a preview link: show the app working rather than
      // a setup screen. The sample data is labelled as such throughout.
      get().useDemo();
      return;
    }

    set({ mode: 'unset', status: 'disconnected', loading: false });
  },

  async connect(conn) {
    set({ status: 'connecting', error: null, loading: true });
    try {
      const boot = await api.bootstrap(conn);
      writeString(KEYS.mode, 'sheet');
      writeJSON(KEYS.connection, conn);
      const saved = hasSavedConfig(boot.config);
      const merged: AppConfig = saved
        ? mergeConfig(boot.config)
        : configFromSheet(DEFAULT_CONFIG, boot.transactions, boot.meta?.detectedCurrency);

      set({
        mode: 'sheet',
        connection: conn,
        status: 'online',
        transactions: sortByDate(boot.transactions),
        config: merged,
        meta: boot.meta,
        loading: false,
        error: null,
        lastSyncAt: Date.now(),
      });
      cacheSnapshot(get());

      // First connection: write the adopted setup back so the other phone gets
      // the same categories and currency without repeating any of this.
      if (!saved) await get().updateConfig({}, { silent: true });
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not connect.';
      set({ status: 'error', error: message, loading: false });
      return false;
    }
  },

  disconnect() {
    remove(KEYS.connection);
    remove(KEYS.cacheTxns);
    remove(KEYS.cacheConfig);
    remove(KEYS.cacheMeta);
    remove(KEYS.queue);
    writeString(KEYS.mode, '');
    set({
      mode: 'unset',
      connection: EMPTY_CONN,
      status: 'disconnected',
      transactions: [],
      config: DEFAULT_CONFIG,
      meta: null,
      queue: [],
      error: null,
      loading: false,
    });
  },

  useDemo() {
    const boot: Bootstrap = demoBootstrap();
    writeString(KEYS.mode, 'demo');
    set({
      mode: 'demo',
      status: 'demo',
      transactions: boot.transactions,
      config: boot.config,
      meta: boot.meta,
      loading: false,
      error: null,
      lastSyncAt: Date.now(),
    });
  },

  /**
   * An empty local ledger to drop a CSV export into. Nothing is written
   * anywhere — it exists so someone can see their own numbers in the app before
   * deciding whether to wire up a spreadsheet at all.
   */
  useLocalPreview() {
    writeString(KEYS.mode, 'demo');
    set({
      mode: 'demo',
      status: 'demo',
      transactions: [],
      config: DEFAULT_CONFIG,
      meta: {
        spreadsheetName: 'Local preview',
        sheetName: 'Imported file',
        headers: [],
        mapping: {
          date: '', description: '', amount: '', type: '', category: '', account: '',
          member: '', notes: '', tags: '', excluded: '', cleared: '',
        },
        rowCount: 0,
        revision: 0,
        lastSyncedAt: new Date().toISOString(),
      },
      loading: false,
      error: null,
      lastSyncAt: Date.now(),
    });
  },

  /**
   * Takes on the categories (and, on an empty ledger, the currency and cards)
   * that the data itself carries. Called after an import, so someone else's
   * taxonomy shows up coloured and named rather than as a wall of grey.
   */
  async adoptFromData(detectedCurrency) {
    const { config, transactions } = get();
    if (!transactions.length) return 0;

    // A brand-new ledger takes the whole shape of the data; an established one
    // only gains the names it hasn't seen before.
    const fresh = config.categories === DEFAULT_CONFIG.categories;
    if (fresh) {
      const next = configFromSheet(config, transactions, detectedCurrency);
      await get().updateConfig(next, { silent: true });
      return next.categories.length;
    }

    const added = newCategories(config, transactions);
    if (!added.length) return 0;
    await get().updateConfig({ categories: [...config.categories, ...added] }, { silent: true });
    return added.length;
  },

  async refresh(opts = {}) {
    const { mode, connection, queue, meta } = get();
    if (mode === 'demo') {
      set({ lastSyncAt: Date.now() });
      return;
    }
    if (mode !== 'sheet' || !connection.url) return;

    // Never pull over the top of unsent local writes.
    if (queue.length) {
      await get().flushQueue();
    }

    // A background poll asks the cheap question first. An explicit refresh
    // always refetches — that is what the button is for.
    if (opts.quiet && meta) {
      try {
        const probe = await api.revision(connection);
        if (probe.revision === meta.revision && probe.rowCount === meta.rowCount) {
          set({ status: 'online', error: null, lastSyncAt: Date.now() });
          return;
        }
      } catch {
        // Fall through to the full fetch, which reports the error properly.
      }
    }

    set({ syncing: true, ...(opts.quiet ? {} : { loading: get().transactions.length === 0 }) });
    try {
      const boot = await api.bootstrap(connection);
      const merged: AppConfig = hasSavedConfig(boot.config)
        ? mergeConfig(boot.config)
        : configFromSheet(DEFAULT_CONFIG, boot.transactions, boot.meta?.detectedCurrency);

      set({
        transactions: sortByDate(boot.transactions),
        config: merged,
        meta: boot.meta,
        status: 'online',
        error: null,
        loading: false,
        syncing: false,
        lastSyncAt: Date.now(),
      });
      cacheSnapshot(get());

      // A new category can show up at any time — the automation invents one, or
      // someone types it into the sheet. Adopt it, but only write when there is
      // genuinely something new, so an idle poll stays read-only.
      const added = newCategories(merged, boot.transactions);
      if (added.length) {
        await get().updateConfig({ categories: [...merged.categories, ...added] }, { silent: true });
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const offline = apiErr?.kind === 'network';
      set({
        syncing: false,
        loading: false,
        status: offline ? 'offline' : 'error',
        error: apiErr?.message ?? 'Sync failed.',
      });
      if (!opts.quiet) {
        get().toast({ message: apiErr?.message ?? 'Sync failed.', tone: 'error' });
      }
    }
  },

  async saveTransactions(txns, opts = {}) {
    if (!txns.length) return;
    const state = get();
    const before = new Map(state.transactions.map((t) => [t.id, t]));
    const stamped = txns.map((t) => ({ ...t, updatedAt: new Date().toISOString() }));

    // Optimistic: the UI updates now; the sheet catches up.
    const next = mergeTransactions(state.transactions, stamped);
    set({ transactions: next });
    cacheSnapshot(get());

    if (opts.undoable !== false) {
      const originals = stamped.map((t) => before.get(t.id)).filter(Boolean) as Transaction[];
      if (originals.length) {
        pushUndo(set, get, {
          label: opts.label ?? 'Edit',
          run: async () => {
            await get().saveTransactions(originals, { undoable: false, label: 'Undo' });
          },
        });
      }
    }

    if (state.mode === 'demo') return;
    await enqueue(set, get, { id: makeId('op'), at: Date.now(), kind: 'upsert', transactions: stamped });
  },

  async createTransaction(partial) {
    const { config } = get();
    const txn: Transaction = {
      id: makeId(),
      date: partial.date ?? todayISO(),
      description: partial.description ?? '',
      amount: Math.abs(partial.amount ?? 0),
      type: partial.type ?? 'expense',
      category: partial.category ?? UNCATEGORIZED,
      account: partial.account ?? config.settings.accounts[0] ?? '',
      member: partial.member ?? config.settings.members[0] ?? '',
      notes: partial.notes ?? '',
      tags: partial.tags ?? [],
      excluded: partial.excluded ?? false,
      cleared: partial.cleared ?? false,
      source: 'app',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    set({ transactions: sortByDate([txn, ...get().transactions]) });
    cacheSnapshot(get());

    pushUndo(set, get, {
      label: 'Add transaction',
      run: async () => {
        await get().deleteTransactions([txn.id]);
      },
    });

    if (get().mode !== 'demo') {
      await enqueue(set, get, { id: makeId('op'), at: Date.now(), kind: 'upsert', transactions: [txn] });
    }
    return txn;
  },

  async deleteTransactions(ids) {
    if (!ids.length) return;
    const state = get();
    const removed = state.transactions.filter((t) => ids.includes(t.id));
    set({ transactions: state.transactions.filter((t) => !ids.includes(t.id)) });
    cacheSnapshot(get());

    pushUndo(set, get, {
      label: `Delete ${removed.length}`,
      run: async () => {
        set({ transactions: sortByDate([...get().transactions, ...removed]) });
        cacheSnapshot(get());
        if (get().mode !== 'demo') {
          await enqueue(set, get, { id: makeId('op'), at: Date.now(), kind: 'upsert', transactions: removed });
        }
      },
    });

    if (state.mode === 'demo') return;
    await enqueue(set, get, { id: makeId('op'), at: Date.now(), kind: 'delete', ids });
  },

  async patchTransaction(id, patch) {
    const current = get().transactions.find((t) => t.id === id);
    if (!current) return;
    await get().saveTransactions([{ ...current, ...patch }], { label: 'Edit transaction' });
  },

  async updateConfig(patch, opts = {}) {
    const config = { ...get().config, ...patch };
    set({ config });
    cacheSnapshot(get());
    if (get().mode === 'demo') return;
    await enqueue(set, get, { id: makeId('op'), at: Date.now(), kind: 'config', config }, { silent: opts.silent });
  },

  async runRules() {
    const { config, transactions } = get();
    const changed = applyRulesToAll(config.rules, transactions);
    if (!changed.length) return 0;
    await get().saveTransactions(changed, { label: `Apply rules to ${changed.length}` });
    return changed.length;
  },

  async flushQueue() {
    const { queue, connection, mode } = get();
    if (mode !== 'sheet' || !queue.length || !connection.url) return;

    const remaining = [...queue];
    while (remaining.length) {
      const op = remaining[0];
      try {
        if (op.kind === 'upsert') await api.upsert(connection, op.transactions);
        else if (op.kind === 'delete') await api.remove(connection, op.ids);
        else await api.saveConfig(connection, op.config);
        remaining.shift();
        set({ queue: [...remaining] });
        writeJSON(KEYS.queue, remaining);
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        if (apiErr?.kind === 'network') {
          // Keep the op; it will replay when we're back online.
          set({ status: 'offline' });
          return;
        }
        // A rejected write will never succeed on retry — drop it and say so,
        // rather than blocking every later write behind it forever.
        remaining.shift();
        set({ queue: [...remaining], status: 'error', error: apiErr?.message ?? 'A change could not be saved.' });
        writeJSON(KEYS.queue, remaining);
        get().toast({
          message: apiErr?.message ?? 'A change could not be saved to the Sheet.',
          tone: 'error',
          duration: 8000,
        });
      }
    }
    if (get().status === 'offline') set({ status: 'online' });
  },

  toast(t) {
    const toast: Toast = { id: makeId('toast'), ...t };
    set({ toasts: [...get().toasts, toast] });
    const ms = t.duration ?? (t.action ? 7000 : 3600);
    setTimeout(() => get().dismissToast(toast.id), ms);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  async undoLast() {
    const stack = [...get().undoStack];
    const entry = stack.pop();
    if (!entry) return;
    set({ undoStack: stack });
    await entry.run();
  },

  setOnline(online) {
    set({ online });
    if (online && get().queue.length) void get().flushQueue();
    if (online && get().status === 'offline') void get().refresh({ quiet: true });
  },
}));

/** Undo depth of 20 — enough to unwind a bad bulk edit, small enough to stay honest. */
function pushUndo(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  entry: UndoEntry,
): void {
  set({ undoStack: [...get().undoStack.slice(-19), entry] });
}

async function enqueue(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  op: PendingOp,
  opts: { silent?: boolean } = {},
): Promise<void> {
  const queue = [...get().queue, op];
  set({ queue });
  writeJSON(KEYS.queue, queue);
  if (!get().online) {
    if (!opts.silent) {
      get().toast({ message: 'Saved on this device — will sync when you are back online.', tone: 'info' });
    }
    return;
  }
  await get().flushQueue();
}

/* ------------------------------- selectors -------------------------------- */

export const selectSettings = (s: AppState) => s.config.settings;
export const selectCategories = (s: AppState) => s.config.categories;
export const selectTransactions = (s: AppState) => s.transactions;
export const selectIsDemo = (s: AppState) => s.mode === 'demo';

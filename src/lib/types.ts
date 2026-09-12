/** Core domain model. Everything the UI renders is one of these shapes. */

export type TxnType = 'expense' | 'income' | 'transfer';

export interface Transaction {
  /** Stable id. Lives in an `_id` column in the sheet so row moves don't break edits. */
  id: string;
  /** ISO `yyyy-mm-dd`. Always date-only — times are noise for a household ledger. */
  date: string;
  description: string;
  /** Always a positive magnitude. Direction is carried by `type`. */
  amount: number;
  type: TxnType;
  category: string;
  account: string;
  /** Who spent it — "Me", "Sara", "Joint"… free-form, managed in Settings. */
  member: string;
  notes: string;
  tags: string[];
  /** Excluded rows still show in the list but never reach budgets or analytics. */
  excluded: boolean;
  /** Reconciled against the real statement. */
  cleared: boolean;
  /** Where the row came from. Sheet rows are Google Spark's; app rows are ours. */
  source: 'sheet' | 'app';
  createdAt?: string;
  updatedAt?: string;
  /** Untouched original cells, so nothing from the sheet is ever silently lost. */
  raw?: Record<string, string>;
}

export type CategoryGroup = 'needs' | 'wants' | 'savings' | 'income' | 'transfer';

export interface Category {
  id: string;
  name: string;
  group: CategoryGroup;
  /** 1-8, indexes the validated categorical palette. */
  slot: number;
  icon: string;
  /** Hidden categories stay attached to old rows but drop out of pickers. */
  hidden?: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  /** Monthly limit in the base currency. */
  amount: number;
  /** Carry unspent (or overspent) amounts into next month. */
  rollover: boolean;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  targetDate?: string;
  note?: string;
  slot: number;
}

export type RuleField = 'description' | 'account' | 'amount' | 'notes' | 'category';
export type RuleOp =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'regex'
  | 'gt'
  | 'lt'
  | 'between';

export interface RuleCondition {
  field: RuleField;
  op: RuleOp;
  value: string;
  /** Only for `between`. */
  value2?: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  /** All conditions must match (AND). Keeps the mental model simple. */
  conditions: RuleCondition[];
  actions: {
    category?: string;
    member?: string;
    type?: TxnType;
    addTags?: string[];
    excluded?: boolean;
    renameTo?: string;
  };
}

export interface Settings {
  currency: string;
  locale: string;
  /** 1 = calendar months. 25 = "my month runs 25th→24th", for salary cycles. */
  monthStartDay: number;
  weekStart: 0 | 1 | 6;
  members: string[];
  accounts: string[];
  theme: 'light' | 'dark' | 'system';
  /** Blur every amount — for glancing at the app in public. */
  privacy: boolean;
  /** Auto-refresh interval in seconds. 0 disables polling. */
  pollSeconds: number;
  /** Soft-delete into an _Archive tab instead of destroying the sheet row. */
  archiveOnDelete: boolean;
  /** Rows above this amount get a subtle "large" marker. */
  largeAmount: number;
}

export interface AppConfig {
  settings: Settings;
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  rules: Rule[];
}

/** Which sheet column feeds which field. Empty string = "not in the sheet". */
export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  /** Optional second column when the sheet splits debit/credit into two. */
  amountOut?: string;
  type: string;
  category: string;
  account: string;
  member: string;
  notes: string;
  tags: string;
  excluded: string;
  cleared: string;
}

export interface SheetMeta {
  spreadsheetName: string;
  sheetName: string;
  /** Real exports rarely start at A1; the backend finds the header row. */
  headerRow?: number;
  /** The currency the sheet's own column says, when it says one consistently. */
  detectedCurrency?: string;
  headers: string[];
  mapping: ColumnMapping;
  rowCount: number;
  /** Bumped by the backend on every write; used to detect other-device edits. */
  revision: number;
  lastSyncedAt: string;
}

export interface Bootstrap {
  transactions: Transaction[];
  config: AppConfig;
  meta: SheetMeta;
}

/** One entry in the offline write queue. Replayed in order once online. */
export type PendingOp =
  | { id: string; at: number; kind: 'upsert'; transactions: Transaction[] }
  | { id: string; at: number; kind: 'delete'; ids: string[] }
  | { id: string; at: number; kind: 'config'; config: AppConfig };

export type ConnectionState =
  | 'demo'
  | 'disconnected'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'error';

export interface DateRange {
  from: string;
  to: string;
}

export interface TxnFilter {
  search: string;
  categories: string[];
  accounts: string[];
  members: string[];
  types: TxnType[];
  tags: string[];
  range: DateRange | null;
  min: number | null;
  max: number | null;
  /** 'any' | 'only' | 'hide' for excluded rows. */
  excluded: 'any' | 'only' | 'hide';
  uncategorizedOnly: boolean;
}

export type SortKey = 'date' | 'amount' | 'description' | 'category';
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

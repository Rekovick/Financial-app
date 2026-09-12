import type { Rule, RuleCondition, Transaction } from './types';
import { parseAmount } from './format';

function conditionMatches(c: RuleCondition, t: Transaction): boolean {
  const raw =
    c.field === 'amount'
      ? t.amount
      : c.field === 'description'
        ? t.description
        : c.field === 'account'
          ? t.account
          : c.field === 'notes'
            ? t.notes
            : t.category;

  if (c.field === 'amount') {
    const n = Number(raw);
    const a = parseAmount(c.value);
    const b = parseAmount(c.value2 ?? '');
    if (c.op === 'gt') return a != null && n > a;
    if (c.op === 'lt') return a != null && n < a;
    if (c.op === 'between') return a != null && b != null && n >= Math.min(a, b) && n <= Math.max(a, b);
    if (c.op === 'equals') return a != null && Math.abs(n - a) < 0.005;
    return false;
  }

  const hay = String(raw ?? '').toLowerCase();
  const needle = c.value.toLowerCase().trim();
  if (!needle) return false;

  switch (c.op) {
    case 'contains':
      return hay.includes(needle);
    case 'equals':
      return hay === needle;
    case 'startsWith':
      return hay.startsWith(needle);
    case 'endsWith':
      return hay.endsWith(needle);
    case 'regex':
      try {
        return new RegExp(c.value, 'i').test(String(raw ?? ''));
      } catch {
        // An in-progress regex shouldn't match everything by accident.
        return false;
      }
    default:
      return false;
  }
}

export function ruleMatches(rule: Rule, t: Transaction): boolean {
  if (!rule.enabled || !rule.conditions.length) return false;
  return rule.conditions.every((c) => conditionMatches(c, t));
}

/**
 * Applies rules top-to-bottom. Later rules can overwrite earlier ones, which is
 * why the list order is editable in the UI.
 * Returns a *new* transaction only when something actually changed.
 */
export function applyRules(rules: Rule[], t: Transaction): Transaction | null {
  let next = t;
  let changed = false;

  for (const rule of rules) {
    if (!ruleMatches(rule, next)) continue;
    const a = rule.actions;
    const patch: Partial<Transaction> = {};

    if (a.category && a.category !== next.category) patch.category = a.category;
    if (a.member && a.member !== next.member) patch.member = a.member;
    if (a.type && a.type !== next.type) patch.type = a.type;
    if (a.excluded != null && a.excluded !== next.excluded) patch.excluded = a.excluded;
    if (a.renameTo && a.renameTo !== next.description) patch.description = a.renameTo;
    if (a.addTags?.length) {
      const merged = [...new Set([...next.tags, ...a.addTags])];
      if (merged.length !== next.tags.length) patch.tags = merged;
    }

    if (Object.keys(patch).length) {
      next = { ...next, ...patch };
      changed = true;
    }
  }

  return changed ? next : null;
}

export function applyRulesToAll(rules: Rule[], txns: Transaction[]): Transaction[] {
  const active = rules.filter((r) => r.enabled);
  if (!active.length) return [];
  const out: Transaction[] = [];
  for (const t of txns) {
    const next = applyRules(active, t);
    if (next) out.push(next);
  }
  return out;
}

/** Preview how many rows a rule would touch, without writing anything. */
export function previewRule(rule: Rule, txns: Transaction[]): Transaction[] {
  return txns.filter((t) => ruleMatches({ ...rule, enabled: true }, t));
}

/** Builds a starter rule from a transaction — the "always categorize this" flow. */
export function ruleFromTransaction(t: Transaction, category: string): Rule {
  const words = t.description
    .replace(/[^A-Za-z0-9؀-ۿ ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w));
  const needle = words.slice(0, 2).join(' ') || t.description.slice(0, 16);
  return {
    id: `rule_${Date.now().toString(36)}`,
    name: `${needle} → ${category}`,
    enabled: true,
    conditions: [{ field: 'description', op: 'contains', value: needle }],
    actions: { category },
  };
}

export const RULE_FIELD_LABELS: Record<RuleCondition['field'], string> = {
  description: 'Description',
  account: 'Account / card',
  amount: 'Amount',
  notes: 'Notes',
  category: 'Category',
};

export const RULE_OP_LABELS: Record<RuleCondition['op'], string> = {
  contains: 'contains',
  equals: 'is exactly',
  startsWith: 'starts with',
  endsWith: 'ends with',
  regex: 'matches regex',
  gt: 'is more than',
  lt: 'is less than',
  between: 'is between',
};

export const TEXT_OPS: RuleCondition['op'][] = ['contains', 'equals', 'startsWith', 'endsWith', 'regex'];
export const NUMBER_OPS: RuleCondition['op'][] = ['gt', 'lt', 'between', 'equals'];

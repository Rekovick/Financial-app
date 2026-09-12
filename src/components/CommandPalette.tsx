import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { NAV } from '@/components/layout/AppShell';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { money, prettyMerchant } from '@/lib/format';
import { formatDate } from '@/lib/dates';
import { cn } from '@/lib/cn';

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

/** ⌘K / Ctrl-K. Jump to a page, run an action, or find a transaction. */
export function CommandPalette() {
  const { commandOpen, setCommand, setQuickAdd, setEditing, togglePrivacy, setTheme, theme } = useUI();
  const { transactions, config, refresh, runRules, toast, undoLast } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommand(!commandOpen);
      }
      if (commandOpen && e.key === 'Escape') setCommand(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandOpen, setCommand]);

  useEffect(() => {
    if (commandOpen) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [commandOpen]);

  const items = useMemo<Item[]>(() => {
    const close = () => setCommand(false);
    const base: Item[] = [
      ...NAV.map((n) => ({
        id: `nav-${n.to}`,
        label: `Go to ${n.label}`,
        group: 'Navigate',
        run: () => {
          navigate(n.to);
          close();
        },
      })),
      {
        id: 'add',
        label: 'Add a transaction',
        hint: 'N',
        group: 'Actions',
        run: () => {
          close();
          setQuickAdd(true);
        },
      },
      {
        id: 'refresh',
        label: 'Sync with Google Sheets',
        group: 'Actions',
        run: () => {
          close();
          void refresh();
        },
      },
      {
        id: 'rules',
        label: 'Run all rules now',
        group: 'Actions',
        run: () => {
          close();
          void runRules().then((n) =>
            toast({
              message: n ? `Updated ${n} transactions` : 'Nothing needed changing',
              tone: n ? 'success' : 'info',
              action: n ? { label: 'Undo', run: () => void undoLast() } : undefined,
            }),
          );
        },
      },
      {
        id: 'privacy',
        label: 'Toggle privacy blur',
        group: 'Actions',
        run: () => {
          close();
          togglePrivacy();
        },
      },
      {
        id: 'theme',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        group: 'Actions',
        run: () => {
          close();
          setTheme(theme === 'dark' ? 'light' : 'dark');
        },
      },
      {
        id: 'undo',
        label: 'Undo last change',
        group: 'Actions',
        run: () => {
          close();
          void undoLast();
        },
      },
    ];

    const q = query.trim().toLowerCase();
    if (!q) return base.slice(0, 10);

    const matched = base.filter((i) => i.label.toLowerCase().includes(q));

    const hits = transactions
      .filter((t) => `${t.description} ${t.category} ${t.notes} ${t.account}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map<Item>((t) => ({
        id: `tx-${t.id}`,
        label: prettyMerchant(t.description) || 'Transaction',
        hint: `${formatDate(t.date, config.settings.locale, 'short')} · ${money(t.amount, config.settings)}`,
        group: 'Transactions',
        run: () => {
          close();
          setEditing(t);
        },
      }));

    return [...matched, ...hits];
  }, [
    query,
    transactions,
    config.settings,
    navigate,
    setCommand,
    setQuickAdd,
    setEditing,
    refresh,
    runRules,
    toast,
    undoLast,
    togglePrivacy,
    setTheme,
    theme,
  ]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!commandOpen) return null;

  const groups = items.reduce<Record<string, Item[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  let flatIndex = -1;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 sm:pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/45 backdrop-blur-[2px]" onClick={() => setCommand(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative flex max-h-[70vh] w-full max-w-lg animate-slide-up flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-pop"
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(items.length - 1, c + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                items[cursor]?.run();
              }
            }}
            placeholder="Search transactions, jump to a page, run an action…"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted sm:block">esc</kbd>
        </div>

        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {Object.entries(groups).map(([group, groupItems]) => (
            <li key={group}>
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{group}</p>
              <ul>
                {groupItems.map((item) => {
                  flatIndex++;
                  const active = flatIndex === cursor;
                  const myIndex = flatIndex;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-active={active}
                        onMouseEnter={() => setCursor(myIndex)}
                        onClick={item.run}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                          active ? 'bg-accent-soft text-accent' : 'hover:bg-hairline',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint && <span className="shrink-0 text-[12px] tnum text-muted">{item.hint}</span>}
                        {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {!items.length && (
            <li className="px-4 py-8 text-center text-[13px] text-muted">Nothing matches “{query}”.</li>
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

import { useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import { UNCATEGORIZED, categoryColor, categoryIcon } from '@/lib/defaults';
import type { Category } from '@/lib/types';

export function CategoryPicker({
  value,
  onChange,
  categories,
  className,
  placeholder = 'Choose a category',
}: {
  value: string;
  onChange: (name: string) => void;
  categories: Category[];
  className?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = categories.filter((c) => !c.hidden && (!q || c.name.toLowerCase().includes(q)));
    const order: Category['group'][] = ['needs', 'wants', 'savings', 'income', 'transfer'];
    const labels: Record<Category['group'], string> = {
      needs: 'Essentials',
      wants: 'Lifestyle',
      savings: 'Saving',
      income: 'Income',
      transfer: 'Transfers',
    };
    return order
      .map((g) => ({ group: g, label: labels[g], items: visible.filter((c) => c.group === g) }))
      .filter((g) => g.items.length);
  }, [categories, query]);

  return (
    <Popover
      width={300}
      trigger={({ toggle, ref, open }) => (
        <button
          type="button"
          ref={ref as never}
          onClick={() => {
            toggle();
            setTimeout(() => inputRef.current?.focus(), 60);
          }}
          aria-expanded={open}
          className={cn('field flex items-center gap-2 text-left', className)}
        >
          <span aria-hidden>{value ? categoryIcon(categories, value) : '🏷️'}</span>
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted')}>{value || placeholder}</span>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: categoryColor(categories, value || UNCATEGORIZED) }}
          />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const first = groups[0]?.items[0];
                  if (first) {
                    onChange(first.name);
                    close();
                  }
                }
              }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {groups.map((g) => (
              <div key={g.group}>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {g.label}
                </p>
                {g.items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c.name);
                      close();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-hairline"
                  >
                    <span aria-hidden>{c.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {value === c.name && <Check className="h-4 w-4 text-accent" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && (
              <p className="px-3 py-6 text-center text-[13px] text-muted">
                No category matches “{query}”. Add one in Settings.
              </p>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

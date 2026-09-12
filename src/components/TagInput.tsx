import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add a tag…',
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const available = suggestions.filter((s) => !value.includes(s)).slice(0, 6);

  const add = (tag: string) => {
    const clean = tag.trim().replace(/^#/, '');
    if (!clean || value.includes(clean)) {
      setDraft('');
      return;
    }
    onChange([...value, clean]);
    setDraft('');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-md bg-hairline px-1.5 py-1 text-[12px] font-medium">
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== t))}
              aria-label={`Remove ${t}`}
              className="text-muted transition-colors hover:text-critical"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[90px] flex-1 bg-transparent px-1 py-0.5 text-[15px] outline-none placeholder:text-muted"
        />
      </div>
      {available.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {available.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className={cn('chip text-[12px] hover:border-accent/40 hover:text-accent')}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const;

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-3 pb-[calc(var(--safe-b)+84px)] sm:items-end sm:px-5 sm:pb-5"
      role="status"
      aria-live="polite"
    >
      {toasts.slice(-3).map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-pop',
              t.tone === 'error'
                ? 'border-critical/25 bg-critical/10 text-ink'
                : t.tone === 'success'
                  ? 'border-good/25 bg-good/10 text-ink'
                  : 'border-hairline bg-surface text-ink',
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                t.tone === 'error' ? 'text-critical' : t.tone === 'success' ? 'text-good' : 'text-muted',
              )}
            />
            <p className="min-w-0 flex-1 text-[13.5px] leading-snug">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[13px] font-semibold text-accent hover:bg-accent/10"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 shrink-0 rounded-md p-1 text-muted hover:bg-hairline hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

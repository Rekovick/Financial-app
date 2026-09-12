import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * One dialog component for both form factors: a bottom sheet on phones (thumb
 * reachable, swipe-to-dismiss affordance) and a centred panel on desktop.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onClose();
      }
      if (e.key !== 'Tab') return;
      // Keep focus inside the dialog.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first meaningful control, not the close button.
    const t = setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')
        ?? panelRef.current?.querySelector<HTMLElement>('input,textarea,select,button');
      target?.focus();
    }, 40);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
      (restoreFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-black/45 backdrop-blur-[2px]"
        onClick={dismissable ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-surface shadow-pop',
          'animate-sheet-up rounded-t-3xl sm:animate-slide-up sm:rounded-2xl',
          widths,
        )}
        style={{ paddingBottom: 'var(--safe-b)' }}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
        {(title || dismissable) && (
          <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p>}
            </div>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1.5 -mt-1 rounded-lg p-2 text-muted transition-colors hover:bg-hairline hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-raised px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation dialog for destructive actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Delete',
  tone = 'danger',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm leading-relaxed text-ink-2">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:bg-raised"
        >
          Cancel
        </button>
        <button
          type="button"
          data-autofocus
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={cn(
            'h-10 rounded-xl px-4 text-sm font-medium text-white transition-colors',
            tone === 'danger' ? 'bg-critical hover:bg-critical/90' : 'bg-accent hover:bg-accent/90',
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

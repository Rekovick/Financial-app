import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * A light anchored popover. Positioned in a portal so it is never clipped by an
 * `overflow: hidden` card, and flipped when it would run off-screen.
 */
export function Popover({
  trigger,
  children,
  align = 'start',
  width = 260,
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 16);
      const panelH = panelRef.current?.offsetHeight ?? 260;
      let left = align === 'end' ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      // Flip above the anchor when there isn't room below.
      const below = r.bottom + 8;
      const top = below + panelH > window.innerHeight - 8 && r.top - panelH - 8 > 8 ? r.top - panelH - 8 : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {trigger({
        open,
        toggle: () => setOpen((v) => !v),
        ref: (el) => {
          anchorRef.current = el;
        },
      })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={cn(
              'fixed z-50 animate-slide-up overflow-hidden rounded-xl border border-hairline bg-surface shadow-pop',
              className,
            )}
            style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16) }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  icon,
  shortcut,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        danger ? 'text-critical hover:bg-critical/10' : 'text-ink hover:bg-hairline',
      )}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <kbd className="shrink-0 text-[11px] text-muted">{shortcut}</kbd>}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-hairline" />;
}

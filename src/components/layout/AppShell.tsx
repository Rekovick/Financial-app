import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChartPie,
  Command,
  Eye,
  EyeOff,
  LayoutGrid,
  ListFilter,
  Moon,
  Plus,
  Repeat,
  Settings as SettingsIcon,
  Sun,
  Target,
  Wallet,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUI } from '@/lib/ui';
import { useStore } from '@/lib/store';
import { PREVIEW_ONLY } from '@/lib/api';
import { PeriodPicker } from './PeriodPicker';
import { SyncBadge } from './SyncBadge';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  /** Shown in the phone tab bar. */
  primary?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid, primary: true },
  { to: '/transactions', label: 'Transactions', icon: ListFilter, primary: true },
  { to: '/insights', label: 'Insights', icon: ChartPie, primary: true },
  { to: '/budgets', label: 'Budgets', icon: Wallet, primary: true },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/rules', label: 'Rules', icon: Wand2 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, primary: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme, privacy, togglePrivacy, setQuickAdd, setCommand } = useUI();
  const mode = useStore((s) => s.mode);

  // Scroll to the top on navigation — otherwise a long list keeps its offset.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

  return (
    <div className="flex min-h-[100dvh] bg-plane">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-hairline bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <Logo />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-tight">Ledgerly</p>
            <p className="truncate text-[11px] text-muted">
              {mode === 'demo' ? 'Sample data' : 'Google Sheets'}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-hairline hover:text-ink',
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={() => setCommand(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-hairline bg-raised px-3 py-2 text-[13px] text-muted transition-colors hover:text-ink"
          >
            <Command className="h-3.5 w-3.5" />
            Quick search
            <kbd className="ml-auto rounded border border-line px-1 text-[10px]">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={() => setQuickAdd(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
          >
            <Plus className="h-4 w-4" />
            Add transaction
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 border-b border-hairline bg-surface/85 backdrop-blur-md"
          style={{ paddingTop: 'var(--safe-t)' }}
        >
          <div className="flex items-center gap-1 px-3 py-2 sm:px-5">
            <div className="lg:hidden">
              <Logo size={28} />
            </div>
            <div className="min-w-0 flex-1">
              <PeriodPicker compact />
            </div>
            <SyncBadge compact />
            <button
              type="button"
              onClick={togglePrivacy}
              aria-label={privacy ? 'Show amounts' : 'Hide amounts'}
              title={privacy ? 'Show amounts' : 'Hide amounts'}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-hairline hover:text-ink"
            >
              {privacy ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setTheme(nextTheme)}
              aria-label={`Theme: ${theme}. Switch to ${nextTheme}.`}
              title={`Theme: ${theme} — click for ${nextTheme}`}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-hairline hover:text-ink"
            >
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : theme === 'light' ? <Sun className="h-4 w-4" /> : <SunMoon />}
            </button>
          </div>
        </header>

        {PREVIEW_ONLY && mode === 'demo' && (
          <div className="border-b border-hairline bg-accent-soft/60 px-3 py-2 sm:px-5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-snug text-ink-2">
              <span>
                You're looking at <strong className="font-semibold text-ink">sample data</strong>.
              </span>
              <NavLink to="/connect" className="font-semibold text-accent underline underline-offset-2">
                Load your own spreadsheet export
              </NavLink>
              <span className="text-muted">— it stays on this device.</span>
            </p>
          </div>
        )}

        <main id="main-scroll" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-3 pb-32 pt-3 sm:px-5 sm:pb-10 sm:pt-5">{children}</div>
        </main>
      </div>

      {/* Phone tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: 'var(--safe-b)' }}
      >
        <div className="flex items-stretch">
          {NAV.filter((n) => n.primary).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted',
                )
              }
            >
              <item.icon className="h-[19px] w-[19px]" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Phone add button, clear of the tab bar */}
      <button
        type="button"
        onClick={() => setQuickAdd(true)}
        aria-label="Add transaction"
        className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-pop transition-transform active:scale-95 lg:hidden"
        style={{ bottom: 'calc(var(--safe-b) + 68px)' }}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Keyboard-only escape hatch for the pages hidden from the phone tab bar */}
      <MoreLinks onNavigate={navigate} />
    </div>
  );
}

function MoreLinks({ onNavigate }: { onNavigate: (to: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const idx = Number(e.key);
      if (Number.isInteger(idx) && idx >= 1 && idx <= NAV.length) {
        e.preventDefault();
        onNavigate(NAV[idx - 1].to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNavigate]);
  return null;
}

function SunMoon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <rect width="40" height="40" rx="11" fill="var(--s1)" />
      <path d="M11 26.5V13.5" stroke="white" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11 26.5h7.5" stroke="white" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M23 27.5V19" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M29 27.5V12.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

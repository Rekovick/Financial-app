import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useUI, initTheme, syncPeriodWithSettings } from '@/lib/ui';

/**
 * Boot, polling, online/offline, visibility, and the global shortcuts.
 * Kept in one place so the ordering between them is obvious.
 */
export function useAppLifecycle(): void {
  const init = useStore((s) => s.init);
  const refresh = useStore((s) => s.refresh);
  const setOnline = useStore((s) => s.setOnline);
  const pollSeconds = useStore((s) => s.config.settings.pollSeconds);
  const monthStartDay = useStore((s) => s.config.settings.monthStartDay);
  const mode = useStore((s) => s.mode);
  const setQuickAdd = useUI((s) => s.setQuickAdd);
  const privacy = useUI((s) => s.privacy);

  useEffect(() => {
    const cleanupTheme = initTheme();
    init();
    return cleanupTheme;
  }, [init]);

  // The reporting period follows the configured salary cycle once it's known.
  useEffect(() => {
    syncPeriodWithSettings(monthStartDay);
  }, [monthStartDay]);

  useEffect(() => {
    document.body.classList.toggle('private', privacy);
  }, [privacy]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  // Poll while the tab is visible, and refresh the moment it comes back.
  useEffect(() => {
    if (mode !== 'sheet' || pollSeconds <= 0) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh({ quiet: true });
    };
    const timer = setInterval(tick, Math.max(20, pollSeconds) * 1000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mode, pollSeconds, refresh]);

  // Global shortcuts, ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setQuickAdd(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setQuickAdd]);
}

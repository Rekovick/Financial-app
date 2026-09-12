import { CloudOff, RefreshCw, TriangleAlert, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/cn';

/** Connection state, honestly reported — never a green dot when writes are stuck. */
export function SyncBadge({ compact }: { compact?: boolean }) {
  const { status, syncing, lastSyncAt, queue, refresh, mode } = useStore();
  const [, force] = useState(0);

  // Re-render once a minute so "3m ago" doesn't go stale on an idle screen.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const pending = queue.length;
  const state =
    syncing ? 'syncing'
    : pending ? 'pending'
    : status === 'offline' ? 'offline'
    : status === 'error' ? 'error'
    : mode === 'demo' ? 'demo'
    : 'ok';

  const meta = {
    syncing: { icon: RefreshCw, text: 'Syncing…', tone: 'text-muted', spin: true },
    pending: { icon: CloudOff, text: `${pending} unsent`, tone: 'text-warning', spin: false },
    offline: { icon: CloudOff, text: 'Offline', tone: 'text-warning', spin: false },
    error: { icon: TriangleAlert, text: 'Sync failed', tone: 'text-critical', spin: false },
    demo: { icon: Wifi, text: 'Sample data', tone: 'text-muted', spin: false },
    ok: { icon: Wifi, text: lastSyncAt ? timeAgo(lastSyncAt) : 'Synced', tone: 'text-muted', spin: false },
  }[state];

  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      title={mode === 'demo' ? 'Sample data — nothing is being saved to a Sheet' : 'Refresh from Google Sheets'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors hover:bg-hairline',
        meta.tone,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', meta.spin && 'animate-spin')} />
      {!compact && <span>{meta.text}</span>}
    </button>
  );
}

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CommandPalette } from '@/components/CommandPalette';
import { TransactionEditor } from '@/components/TransactionEditor';
import { BulkBar } from '@/components/BulkBar';
import { Toasts } from '@/components/ui/Toasts';
import { Skeleton } from '@/components/ui/Misc';
import { Dashboard } from '@/pages/Dashboard';
import { Transactions } from '@/pages/Transactions';
import { Insights } from '@/pages/Insights';
import { Budgets } from '@/pages/Budgets';
import { Recurring } from '@/pages/Recurring';
import { Goals } from '@/pages/Goals';
import { Rules } from '@/pages/Rules';
import { Settings } from '@/pages/Settings';
import { Connect } from '@/pages/Connect';
import { PREVIEW_ONLY } from '@/lib/api';
import { useStore } from '@/lib/store';
import { useAppLifecycle } from '@/hooks/useAppLifecycle';

export default function App() {
  useAppLifecycle();
  const { mode, loading } = useStore();
  const { pathname } = useLocation();

  // On a preview link the store boots straight into the sample ledger, but that
  // happens in an effect — so don't bounce to setup in the frame before it runs.
  if (mode === 'unset' && !PREVIEW_ONLY && pathname !== '/connect') {
    return <Navigate to="/connect" replace />;
  }

  if (pathname === '/connect') {
    return (
      <div className="min-h-[100dvh] bg-plane px-3 py-6 sm:px-5">
        <Connect />
        <Toasts />
      </div>
    );
  }

  return (
    <AppShell>
      {loading ? (
        <LoadingSkeleton />
      ) : (
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}

      <TransactionEditor />
      <CommandPalette />
      <BulkBar />
      <Toasts />
    </AppShell>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your ledger">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
      </div>
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}

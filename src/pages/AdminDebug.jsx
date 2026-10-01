import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, MicroLabel } from '@/components/brand/Brand';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

function AdminDebugPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleLookup = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('stripeDebugLookup', { email });
      setResult(response.data);
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('syncUserSubscription', {});
      setResult({ ...result, sync: response.data });
    } catch (error) {
      setResult({ ...result, sync: { error: error.message } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <PageHeader eyebrow="Admin" title="Stripe subscription debug" subtitle="Look up a customer by email and resync their plan." />
      <Card>
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div className="space-y-3">
            <MicroLabel as="label">Email address</MicroLabel>
            <div className="flex gap-2">
              <Input
                placeholder="testmergerss@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="button" className="btn-brand disabled:opacity-50" onClick={handleLookup} disabled={!email || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
              </button>
            </div>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="panel-raised p-4">
                <pre className="max-h-96 overflow-auto font-mono text-xs text-stone-300">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>

              {result.stripe_customer_id && (
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={loading}
                  className="btn-soft w-full py-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sync user plan'}
                </button>
              )}

              {result.stripe_customer_id && result.stripe_subscription_id && (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Active Stripe subscription found
                </div>
              )}

              {!result.stripe_customer_id && !result.error && (
                <div className="flex items-center gap-2 text-amber-400 text-sm">
                  <XCircle className="w-4 h-4" />
                  No Stripe customer found
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// --- Admin-only guard (non-admins see an "Admins only" message; inner page never mounts) ---
function AdminOnlyGuard({ children }) {
  const [access, setAccess] = React.useState('loading');
  React.useEffect(() => {
    let cancelled = false;
    base44.auth.me()
      .then((u) => { if (!cancelled) setAccess(u?.role === 'admin' ? 'admin' : 'denied'); })
      .catch(() => { if (!cancelled) setAccess('denied'); });
    return () => { cancelled = true; };
  }, []);
  if (access === 'loading') {
    return <div className="p-6 lg:p-8 max-w-3xl mx-auto text-sm text-stone-500">Loading...</div>;
  }
  if (access !== 'admin') {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="panel p-8 text-center">
          <h2 className="font-display text-lg font-semibold text-stone-200 mb-1">Admins only</h2>
          <p className="text-sm text-stone-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function AdminDebug() {
  return (
    <AdminOnlyGuard>
      <AdminDebugPage />
    </AdminOnlyGuard>
  );
}

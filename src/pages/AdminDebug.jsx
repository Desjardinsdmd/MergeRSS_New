import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function AdminDebug() {
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
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Stripe Subscription Debug</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium">Email Address</label>
            <div className="flex gap-2">
              <Input
                placeholder="testmergerss@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button onClick={handleLookup} disabled={!email || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
              </Button>
            </div>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="bg-stone-900 rounded p-4">
                <pre className="text-xs text-stone-300 overflow-auto max-h-96">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>

              {result.stripe_customer_id && (
                <Button
                  onClick={handleSync}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Sync User Plan'}
                </Button>
              )}

              {result.stripe_customer_id && result.stripe_subscription_id && (
                <div className="flex items-center gap-2 text-green-500 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Active Stripe subscription found
                </div>
              )}

              {!result.stripe_customer_id && !result.error && (
                <div className="flex items-center gap-2 text-orange-500 text-sm">
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
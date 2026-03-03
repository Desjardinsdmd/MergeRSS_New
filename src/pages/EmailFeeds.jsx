import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Copy, Check, Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function EmailFeeds() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).finally(() => setLoading(false));
  }, []);

  const { data: emailFeeds = [] } = useQuery({
    queryKey: ['email-feeds', user?.email],
    queryFn: () => user ? base44.entities.EmailFeed.filter({ user_email: user.email }) : [],
    enabled: !!user,
  });

  const emailFeed = emailFeeds.find(f => f.is_active) || emailFeeds[0];

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['newsletter-subscriptions', emailFeed?.id],
    queryFn: () => emailFeed ? base44.entities.NewsletterSubscription.filter({ email_feed_id: emailFeed.id }) : [],
    enabled: !!emailFeed,
  });

  const handleInitialize = async () => {
    setInitializing(true);
    try {
      const { data } = await base44.functions.invoke('initEmailFeed');
      if (data.success) {
        toast.success('Email feed created! Share your unique address with newsletters.');
      }
    } catch (error) {
      toast.error('Failed to create email feed');
    } finally {
      setInitializing(false);
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailFeed.unique_email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Email address copied!');
  };

  const handleUnsubscribe = async (subscriptionId) => {
    try {
      await base44.entities.NewsletterSubscription.update(subscriptionId, { is_active: false });
      toast.success('Unsubscribed from newsletter');
    } catch (error) {
      toast.error('Failed to unsubscribe');
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-2">
          <Mail className="w-8 h-8 text-amber-400" />
          Email Feeds
        </h1>
        <p className="text-stone-500 mt-2">Subscribe to newsletters using your unique email address. Articles are automatically added to your feeds.</p>
      </div>

      <div className="space-y-6">
        {/* Email Address Card */}
        {!emailFeed ? (
          <Card className="border-stone-800 bg-stone-900">
            <CardHeader>
              <CardTitle className="text-lg">Get Started with Email Feeds</CardTitle>
              <CardDescription>Create a unique email address to forward newsletters to</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleInitialize}
                disabled={initializing}
                className="bg-amber-400 hover:bg-amber-300 text-stone-900 font-semibold"
              >
                {initializing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Email Feed
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-400/50 bg-stone-900 border-2">
            <CardHeader>
              <CardTitle className="text-lg">Your Unique Email Address</CardTitle>
              <CardDescription>Use this address to subscribe to newsletters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-stone-800 border border-stone-700 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm text-stone-500 mb-1">Email Address</p>
                  <p className={cn('text-lg font-mono break-all', !showEmail && 'blur-sm')}>
                    {emailFeed.unique_email}
                  </p>
                </div>
                <button
                  onClick={() => setShowEmail(!showEmail)}
                  className="p-2 text-stone-400 hover:text-stone-200 transition"
                  aria-label={showEmail ? 'Hide email' : 'Show email'}
                >
                  {showEmail ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyEmail}
                  className="border-stone-700"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>

              <div className="pt-2">
                <p className="text-xs text-stone-500 mb-2">
                  <strong>How it works:</strong> Copy this address and use it to subscribe to email newsletters. Emails will automatically be processed, articles extracted, and added to your feeds.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-stone-400">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                {emailFeed.total_received ? `${emailFeed.total_received} emails received` : 'Waiting for first email'}
                {emailFeed.last_email_date && (
                  <span className="text-stone-500">
                    • Last: {new Date(emailFeed.last_email_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subscriptions List */}
        {emailFeed && (
          <div>
            <h2 className="text-lg font-semibold text-stone-100 mb-4">Subscribed Newsletters</h2>
            {subscriptions.filter(s => s.is_active).length === 0 ? (
              <Card className="border-stone-800 bg-stone-900">
                <CardContent className="py-8 text-center">
                  <p className="text-stone-500">No active subscriptions yet. Forward newsletters to your unique email address to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {subscriptions.filter(s => s.is_active).map((sub) => (
                  <Card key={sub.id} className="border-stone-800 bg-stone-900">
                    <CardContent className="py-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-stone-100">{sub.newsletter_name}</p>
                        <p className="text-xs text-stone-500 mt-1">
                          From: {sub.from_email}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {sub.email_count} email{sub.email_count !== 1 ? 's' : ''}
                          </Badge>
                          {sub.last_email_date && (
                            <span className="text-xs text-stone-600">
                              Last: {new Date(sub.last_email_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUnsubscribe(sub.id)}
                        className="text-stone-400 hover:text-red-400"
                        title="Unsubscribe from this newsletter"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
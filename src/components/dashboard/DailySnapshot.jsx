import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const categoryColors = {
  CRE: 'bg-orange-100 text-orange-700',
  Markets: 'bg-blue-100 text-blue-700',
  Tech: 'bg-purple-100 text-purple-700',
  News: 'bg-slate-100 text-slate-700',
  Finance: 'bg-green-100 text-green-700',
  Crypto: 'bg-yellow-100 text-yellow-700',
  AI: 'bg-indigo-100 text-indigo-700',
  Other: 'bg-gray-100 text-gray-700',
};

export default function DailySnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [reason, setReason] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const cacheKey = 'dailySnapshot_' + new Date().toDateString();
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setSnapshot(parsed.snapshot);
        setReason(parsed.reason);
        setLoading(false);
        return;
      }
      const res = await base44.functions.invoke('dailyDigestSnapshot', {});
      const data = res.data;
      localStorage.setItem(cacheKey, JSON.stringify(data));
      setSnapshot(data.snapshot);
      setReason(data.reason);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    localStorage.removeItem('dailySnapshot_' + new Date().toDateString());
    await load();
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 mb-6 text-white flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0 opacity-80" />
        <p className="text-sm opacity-90">Generating today's brief...</p>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 mb-6 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-semibold tracking-wide uppercase opacity-90">Today's Brief</span>
          {snapshot.article_count > 0 && (
            <span className="text-xs opacity-60">{snapshot.article_count} articles</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="p-1.5 rounded-lg hover:bg-white/10 transition opacity-70 hover:opacity-100">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-lg hover:bg-white/10 transition opacity-70 hover:opacity-100">
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <p className="text-sm leading-relaxed mt-3 opacity-95">{snapshot.brief}</p>
          {snapshot.top_categories?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {snapshot.top_categories.map(cat => (
                <span
                  key={cat}
                  className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 text-white font-medium"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
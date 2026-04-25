import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Info, TrendingUp, ArrowUp, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const TAB_KEYS = ['CRE', 'AI/Tech', 'Macro'];

function MultiplierBadge({ multiplier }) {
  const color = multiplier >= 10 ? 'text-red-400 bg-red-950/50 border-red-900/50'
    : multiplier >= 5 ? 'text-orange-400 bg-orange-950/50 border-orange-900/50'
    : 'text-amber-400 bg-amber-950/50 border-amber-900/50';

  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-bold border rounded ${color}`}>
      <ArrowUp className="w-2.5 h-2.5" />
      {multiplier}x
    </span>
  );
}

function MiniSparkline({ data }) {
  // data is an array of weekly counts: [w1, w2, w3, w4, w5]
  const chartData = data.map((v, i) => ({ w: i, v }));
  return (
    <div className="w-[60px] h-[20px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SignalRow({ signal }) {
  // Generate a simple 5-week sparkline from baseline + current
  // baseline is the weekly average, current is this week
  const baseline = signal.baseline_count || 0;
  const current = signal.current_week_count || 0;
  // Approximate: baseline for 4 weeks, then current spike
  const sparkData = [
    Math.round(baseline * 0.8),
    Math.round(baseline),
    Math.round(baseline * 1.1),
    Math.round(baseline * 0.9),
    current,
  ];

  const topArticle = signal.top_articles?.[0];

  return (
    <div className="py-2.5 border-b border-stone-800 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-semibold text-stone-100 truncate">{signal.entity}</span>
          <MiniSparkline data={sparkData} />
        </div>
        <MultiplierBadge multiplier={signal.multiplier} />
      </div>
      <p className="text-[11px] text-stone-500 mt-0.5">
        {signal.current_week_count} mentions this week, baseline {signal.baseline_count}
      </p>
      {topArticle && (
        <a
          href={topArticle.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-stone-400 hover:text-[hsl(var(--primary))] transition mt-1 flex items-center gap-1 line-clamp-1"
        >
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{topArticle.title}</span>
        </a>
      )}
    </div>
  );
}

function EmptyTab({ category }) {
  return (
    <div className="py-8 text-center">
      <p className="text-xs text-stone-500">No unusual activity in {category} this week — signal volume is at baseline.</p>
    </div>
  );
}

export default function RisingSignalsWidget() {
  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['rising-signals'],
    queryFn: async () => {
      const res = await base44.functions.invoke('risingSignals', {});
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const signals = response?.signals || {};

  // Determine default tab: whichever has the most entities
  const defaultTab = useMemo(() => {
    let best = TAB_KEYS[0];
    let bestCount = 0;
    for (const key of TAB_KEYS) {
      const count = (signals[key] || []).length;
      if (count > bestCount) { bestCount = count; best = key; }
    }
    return best;
  }, [signals]);

  const hasAnySignals = TAB_KEYS.some(k => (signals[k] || []).length > 0);

  return (
    <div className="bg-stone-900 border border-stone-800 p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-stone-100 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            Rising Signals
          </h3>
          <p className="text-[11px] text-stone-500 leading-snug mt-0.5">Entities mentioned 3x more than usual this week, weighted by source authority</p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-stone-600 hover:text-stone-400 transition cursor-help flex-shrink-0 mt-0.5" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-stone-950 border border-stone-700 text-stone-200 text-xs max-w-[220px]">
              Named entities suddenly appearing more often than their normal baseline.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex-1 space-y-3 py-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-stone-800 rounded animate-pulse w-3/4" />
              <div className="h-2 bg-stone-800 rounded animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Error / empty enrichment state */}
      {!isLoading && (isError || (!hasAnySignals && response?.items_analyzed === 0)) && (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-xs text-stone-500 text-center max-w-[200px]">
            Rising signals computing — first results expected within 24 hours of next enrichment cycle.
          </p>
        </div>
      )}

      {/* Tabs with signals */}
      {!isLoading && !isError && (
        <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="bg-stone-800 rounded-lg p-0.5 h-7 mb-2">
            {TAB_KEYS.map(key => (
              <TabsTrigger key={key} value={key} className="rounded text-[11px] px-2.5 py-0.5 h-6 data-[state=active]:bg-stone-700">
                {key}
                {(signals[key] || []).length > 0 && (
                  <span className="ml-1 text-[9px] font-bold text-[hsl(var(--primary))]">
                    {(signals[key] || []).length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {TAB_KEYS.map(key => (
            <TabsContent key={key} value={key} className="flex-1 overflow-y-auto mt-0">
              {(signals[key] || []).length === 0 ? (
                <EmptyTab category={key} />
              ) : (
                <div>
                  {(signals[key] || []).slice(0, 5).map((signal, idx) => (
                    <SignalRow key={idx} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
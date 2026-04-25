import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer
} from 'recharts';

const CATEGORIES = [
  { key: 'CRE', label: 'CRE', cats: ['cre'] },
  { key: 'Markets', label: 'Markets', cats: ['markets', 'finance'] },
  { key: 'Tech', label: 'Tech', cats: ['tech'] },
  { key: 'AI', label: 'AI', cats: ['ai'] },
  { key: 'News', label: 'News', cats: ['news'] },
  { key: 'Macro', label: 'Macro', cats: ['geopolitics'] },
];

function matchCategory(itemCat, targetCats) {
  const c = (itemCat || '').toLowerCase();
  return targetCats.includes(c);
}

// Macro special case: also absorb items with macro-like tags/keywords in news/finance
function isMacroItem(item) {
  const cat = (item.category || '').toLowerCase();
  if (cat === 'geopolitics') return true;
  const text = ((item.title || '') + ' ' + (item.tags || []).join(' ')).toLowerCase();
  return /\b(macro|geopolit|rates|regulation|tariff|central bank|fed |monetary|fiscal|inflation|gdp|recession)\b/.test(text);
}

function categorizeFeedItem(item) {
  for (const cat of CATEGORIES) {
    if (cat.key === 'Macro') {
      if (isMacroItem(item)) return 'Macro';
    } else if (matchCategory(item.category, cat.cats)) {
      return cat.key;
    }
  }
  return null; // doesn't fit any spoke
}

export default function SignalRadarChart({ user, feeds }) {
  const navigate = useNavigate();
  const feedIds = useMemo(() => feeds.map(f => f.id), [feeds]);

  const since28d = useMemo(() => new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(), []);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['radar-items', user?.email],
    queryFn: () => base44.entities.FeedItem.filter(
      { feed_id: { $in: feedIds }, published_date: { $gte: since28d }, importance_score: { $gte: 80 } },
      '-published_date', 500
    ),
    enabled: !!user && feedIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo(() => {
    if (!items.length) return CATEGORIES.map(c => ({ category: c.label, key: c.key, thisWeek: 0, baseline: 0, tagBalance: 'neutral' }));

    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const weekCounts = {};
    const olderCounts = {};
    const tagBalances = {};
    CATEGORIES.forEach(c => { weekCounts[c.key] = 0; olderCounts[c.key] = 0; tagBalances[c.key] = { opp: 0, risk: 0 }; });

    for (const item of items) {
      const bucket = categorizeFeedItem(item);
      if (!bucket) continue;
      if (item.published_date >= since7d) {
        weekCounts[bucket]++;
        if (item.intelligence_tag === 'Opportunity') tagBalances[bucket].opp++;
        if (item.intelligence_tag === 'Risk') tagBalances[bucket].risk++;
      } else {
        olderCounts[bucket]++;
      }
    }

    // Normalize this week to 0-100 (max spoke = 100)
    const maxWeek = Math.max(1, ...Object.values(weekCounts));
    // Baseline: older / 3 weeks, then normalize
    const baselineRaw = {};
    CATEGORIES.forEach(c => { baselineRaw[c.key] = olderCounts[c.key] / 3; });
    const maxBaseline = Math.max(1, ...Object.values(baselineRaw));
    // Use same denominator (max of both) so the scales are comparable
    const denom = Math.max(maxWeek, maxBaseline);

    return CATEGORIES.map(c => {
      const rawWeek = weekCounts[c.key];
      const rawBase = baselineRaw[c.key];
      const isAtBaseline = rawWeek === 0;
      return {
        category: c.label,
        key: c.key,
        thisWeek: isAtBaseline ? 5 : Math.round((rawWeek / denom) * 100),
        baseline: Math.round((rawBase / denom) * 100),
        rawThisWeek: rawWeek,
        rawBaseline: Math.round(rawBase * 10) / 10,
        tagBalance: isAtBaseline ? 'baseline' : (tagBalances[c.key].opp > tagBalances[c.key].risk ? 'opportunity' : tagBalances[c.key].risk > tagBalances[c.key].opp ? 'risk' : 'neutral'),
        isAtBaseline,
      };
    });
  }, [items]);

  const handleSpokeClick = (categoryKey) => {
    // Map spoke key to the Feeds page category filter
    const catMap = { CRE: 'CRE', Markets: 'Markets', Tech: 'Tech', AI: 'AI', News: 'News', Macro: 'News' };
    navigate(createPageUrl('ArticleSearch') + `?category=${catMap[categoryKey] || categoryKey}`);
  };

  const CustomTick = ({ x, y, payload }) => {
    const entry = chartData.find(d => d.category === payload.value);
    const color = entry?.tagBalance === 'baseline' ? '#57534e' : entry?.tagBalance === 'opportunity' ? '#4ade80' : entry?.tagBalance === 'risk' ? '#f87171' : '#78716c';
    return (
      <text
        x={x} y={y}
        textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={11} fontWeight={600}
        className="cursor-pointer"
        onClick={() => handleSpokeClick(entry?.key || '')}
      >
        {payload.value}
      </text>
    );
  };

  return (
    <div className="bg-stone-900 border border-stone-800 p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-sm font-bold text-stone-100">Signal Radar</h3>
          <p className="text-[11px] text-stone-500 leading-snug mt-0.5">Last 7 days vs 4-week baseline — high-importance items only (score 80+)</p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-stone-600 hover:text-stone-400 transition cursor-help flex-shrink-0 mt-0.5" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-stone-950 border border-stone-700 text-stone-200 text-xs max-w-[200px]">
              Where this week is noisier than usual. Tap a spoke to drill in.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="space-y-2 w-full max-w-[200px]">
              <div className="h-3 bg-stone-800 rounded animate-pulse" />
              <div className="h-32 bg-stone-800 rounded animate-pulse" />
              <div className="h-3 bg-stone-800 rounded animate-pulse w-2/3 mx-auto" />
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={chartData} outerRadius="70%">
              <PolarGrid stroke="#292524" />
              <PolarAngleAxis dataKey="category" tick={<CustomTick />} />
              <Radar
                name="This Week"
                dataKey="thisWeek"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.4}
                strokeWidth={2}
              />
              <Radar
                name="4-Week Baseline"
                dataKey="baseline"
                stroke="#a8a29e"
                fill="none"
                strokeWidth={2}
                strokeDasharray="6 3"
                strokeOpacity={0.65}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Baseline categories line */}
      {(() => {
        const baselineCats = chartData.filter(d => d.isAtBaseline).map(d => d.category);
        if (!baselineCats.length) return null;
        return (
          <p className="text-[10px] text-stone-600 text-center mt-2 px-2">
            Categories at baseline: {baselineCats.join(', ')}
          </p>
        );
      })()}

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 pt-2 border-t border-stone-800 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 bg-blue-500/40 border border-blue-500 rounded-sm" />
          <span className="text-[10px] text-stone-500">This week</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 border-t-2 border-dashed border-stone-400" />
          <span className="text-[10px] text-stone-500">4-week baseline</span>
        </div>
      </div>
    </div>
  );
}
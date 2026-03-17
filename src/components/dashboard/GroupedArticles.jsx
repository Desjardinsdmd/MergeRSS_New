import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ArticleCard from '@/components/feeds/ArticleCard';

export default function GroupedArticles({
  articles,
  feeds,
  onExpand,
  onMarkAsRead,
  onSummaryUpdate,
  showBookmark = true,
  maxItems = 5,
}) {
  const [expandedGroups, setExpandedGroups] = React.useState({});

  const grouped = useMemo(() => {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));
    const groups = {};

    articles.forEach(article => {
      const feedId = article.feed_id;
      const feed = feedMap[feedId];
      const feedName = feed?.name || 'Unknown Feed';

      if (!groups[feedName]) {
        groups[feedName] = [];
      }
      groups[feedName].push(article);
    });

    return groups;
  }, [articles, feeds]);

  const toggleGroup = (feedName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [feedName]: !prev[feedName],
    }));
  };

  const groupNames = Object.keys(grouped).sort();
  const totalArticles = articles.length;

  return (
    <div className="space-y-3">
      {groupNames.map(feedName => {
        const articles = grouped[feedName];
        const isExpanded = expandedGroups[feedName] !== false;
        const displayCount = isExpanded ? articles.length : 1;
        const hiddenCount = articles.length - displayCount;

        return (
          <div key={feedName} className="bg-stone-900/40 border border-stone-800/50 overflow-hidden">
            <button
              onClick={() => toggleGroup(feedName)}
              className="w-full flex items-center justify-between p-3 hover:bg-stone-800/30 transition text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                  {feedName}
                </span>
                <span className="text-xs bg-stone-800 text-stone-500 px-2 py-0.5 rounded">
                  {articles.length}
                </span>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-stone-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-stone-600" />
              )}
            </button>

            {isExpanded && (
              <div className="border-t border-stone-800/30">
                {articles.slice(0, displayCount).map((item) => (
                  <ArticleCard
                    key={item.id}
                    item={item}
                    onExpand={onExpand}
                    onMarkAsRead={onMarkAsRead}
                    onSummaryUpdate={onSummaryUpdate}
                    showBookmark={showBookmark}
                  />
                ))}
              </div>
            )}

            {hiddenCount > 0 && isExpanded && (
              <div className="px-4 py-2 bg-stone-950/40 text-xs text-stone-500 border-t border-stone-800/30">
                +{hiddenCount} more from {feedName}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
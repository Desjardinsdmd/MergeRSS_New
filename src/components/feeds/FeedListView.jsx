import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, Pause, Play, ExternalLink, ChevronDown, ChevronUp, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { safeUrl, decodeHtml } from '@/components/utils/htmlUtils';
import SourceHealthIndicator from './SourceHealthIndicator';
import { queryArticles } from '@/api/articles';

export default function FeedListView({ feeds, selectedIds, onSelectionChange, onEdit, onDelete, onToggleStatus, onToggleShare }) {
  const [expandedFeedId, setExpandedFeedId] = useState(null);
  const [articlesByFeed, setArticlesByFeed] = useState({});
  const [loadingFeedId, setLoadingFeedId] = useState(null);

  const toggleFeed = async (feed) => {
    if (expandedFeedId === feed.id) { setExpandedFeedId(null); return; }
    setExpandedFeedId(feed.id);
    if (articlesByFeed[feed.id]) return;
    setLoadingFeedId(feed.id);
    const items = await queryArticles({ feed_ids: [feed.id], sort: '-published_date', limit: 20 });
    setArticlesByFeed(prev => ({ ...prev, [feed.id]: items }));
    setLoadingFeedId(null);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      onSelectionChange(feeds.map(f => f.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (feedId, checked) => {
    if (checked) {
      onSelectionChange([...selectedIds, feedId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== feedId));
    }
  };

  const thClass = 'px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500';

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[600px]">
        <thead className="border-b border-white/[0.07]">
          <tr>
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={selectedIds.length === feeds.length && feeds.length > 0}
                onCheckedChange={handleSelectAll}
              />
            </th>
            <th className={thClass}>Source</th>
            <th className={thClass}>Category</th>
            <th className={thClass}>Health</th>
            <th className={thClass}>Status</th>
            <th className={thClass}>Activity</th>
            <th className="w-10 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
           {feeds.map((feed) => {
             return (
             <React.Fragment key={feed.id}>
             <tr className="transition hover:bg-white/[0.03]">
              <td className="px-4 py-3">
                <Checkbox
                  checked={selectedIds.includes(feed.id)}
                  onCheckedChange={(checked) => handleSelectOne(feed.id, checked)}
                />
              </td>
              <td className="px-4 py-3">
                <div>
                  <p className="font-semibold text-stone-100">{feed.name}</p>
                   <a
                      href={safeUrl(feed.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-sm truncate font-mono text-[11px] text-stone-500 hover:text-[#C4A5FD]"
                    >
                      {feed.url}
                    </a>
                </div>
              </td>
              <td className="px-4 py-3">
                {feed.category && <span className="chip-brand">{feed.category}</span>}
              </td>
              <td className="px-4 py-3">
                <SourceHealthIndicator feed={feed} />
              </td>
              <td className="px-4 py-3">
                {feed.status === 'active' ? (
                  <span className="chip border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">Active</span>
                ) : (
                  <span className="chip border border-amber-400/25 bg-amber-400/10 text-amber-300">Paused</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-stone-500">
                <button
                  onClick={() => toggleFeed(feed)}
                  aria-expanded={expandedFeedId === feed.id}
                  className="flex items-center gap-1 transition-colors hover:text-[#C4A5FD]"
                >
                  {expandedFeedId === feed.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {feed.item_count || 0} stories
                </button>
              </td>
              <td className="px-4 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" aria-label="Source actions">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(feed)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleStatus(feed)}>
                      {feed.status === 'active' ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Activate
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={safeUrl(feed.url)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open source
                      </a>
                    </DropdownMenuItem>
                    {onToggleShare && (
                      <DropdownMenuItem onClick={() => onToggleShare(feed)}>
                        <Users className="w-4 h-4 mr-2" />
                        {feed.workspace_id ? 'Stop sharing with team' : 'Share with team'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDelete(feed)}
                      className="text-red-400 focus:text-red-300"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
            {expandedFeedId === feed.id && (
              <tr className="bg-white/[0.02]">
                <td colSpan={7} className="px-6 py-3">
                  {loadingFeedId === feed.id ? (
                    <div className="flex items-center gap-2 text-xs text-stone-500 py-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading stories…
                    </div>
                  ) : (articlesByFeed[feed.id] || []).length === 0 ? (
                    <p className="text-xs text-stone-500">No stories found.</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                      {(articlesByFeed[feed.id] || []).map((article) => (
                        <li key={article.id} className="flex items-start gap-3">
                          <a
                            href={safeUrl(article.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="line-clamp-1 flex-1 text-xs text-stone-300 hover:text-[#C4A5FD]"
                          >
                            {decodeHtml(article.title)}
                          </a>
                          {article.published_date && (
                            <span className="flex-shrink-0 font-mono text-[10px] text-stone-500">
                              {new Date(article.published_date).toLocaleDateString()}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            )}
            </React.Fragment>
             );
            })}
            </tbody>
      </table>
    </div>
  );
}
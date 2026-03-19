import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Rss, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Pause, 
  Play,
  ExternalLink,
  Clock,
  AlertCircle,
  Bell,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeUrl, decodeHtml } from '@/components/utils/htmlUtils';
import FeedAlertsDialog from '@/components/feeds/FeedAlertsDialog';
import SourceHealthBadge from './SourceHealthBadge';
import SourceActivityMetrics from './SourceActivityMetrics';
import SourceIssueIndicator from './SourceIssueIndicator';
import SourceCleanupDialog from './SourceCleanupDialog';
import RepairEscalationPanel from './RepairEscalationPanel';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const categoryColors = {
  CRE: 'bg-blue-950 text-blue-400',
  Markets: 'bg-green-950 text-green-400',
  Tech: 'bg-purple-950 text-purple-400',
  News: 'bg-orange-950 text-orange-400',
  Finance: 'bg-emerald-950 text-emerald-400',
  Crypto: 'bg-yellow-950 text-yellow-400',
  AI: 'bg-pink-950 text-pink-400',
  Other: 'bg-stone-800 text-stone-300',
};

export default function FeedCard({ feed, onEdit, onDelete, onToggleStatus, onRefresh }) {
  const [showAlerts, setShowAlerts] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  const { data: health } = useQuery({
    queryKey: ['source-health', feed.id],
    queryFn: () => base44.entities.SourceHealth.filter({ feed_id: feed.id }, '-created_date', 1),
    enabled: !!feed.id,
    staleTime: 5 * 60 * 1000,
  });

  const currentHealth = health?.[0] || null;

  const toggleArticles = async (e) => {
    e.stopPropagation();
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (articles.length > 0) return;
    setLoadingArticles(true);
    const items = await base44.entities.FeedItem.filter({ feed_id: feed.id }, '-published_date', 20);
    setArticles(items);
    setLoadingArticles(false);
  };

  return (
    <>
    <Card className={cn(
      "border-stone-800 bg-stone-900 transition-all hover:shadow-md",
      feed.status === 'error' && "border-red-900 bg-red-950/30"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-10 h-10 flex items-center justify-center flex-shrink-0",
            feed.status === 'error' ? "bg-red-950" : "bg-stone-800"
          )}>
            <Rss className={cn(
              "w-5 h-5",
              feed.status === 'error' ? "text-red-400" : "text-[hsl(var(--primary))]"
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-stone-200 truncate">
                    {feed.name}
                  </h3>
                  {currentHealth && <SourceHealthBadge health={currentHealth} compact />}
                </div>
                <a 
                  href={safeUrl(feed.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-stone-500 hover:text-[hsl(var(--primary))] truncate block mb-2"
                >
                  {feed.url}
                </a>
                {currentHealth && <SourceActivityMetrics health={currentHealth} feed={feed} />}
              </div>
              
              <div className="flex items-center gap-1">
                {currentHealth && <SourceIssueIndicator issues={currentHealth.issues} />}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(feed)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowAlerts(true)}>
                      <Bell className="w-4 h-4 mr-2" />
                      Alerts
                    </DropdownMenuItem>
                    {currentHealth && (
                      <DropdownMenuItem onClick={() => setCleanupOpen(true)}>
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Health
                      </DropdownMenuItem>
                    )}
                  <DropdownMenuItem onClick={() => window.open(safeUrl(feed.url), '_blank')}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Feed
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
                  <DropdownMenuItem 
                    onClick={() => onDelete(feed)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge className={categoryColors[feed.category] || categoryColors.Other}>
                {feed.category}
              </Badge>
              
              {feed.tags?.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-4 mt-3 text-xs text-stone-500">
              {feed.status === 'error' ? (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertCircle className="w-3 h-3" />
                  Error fetching
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {feed.last_fetched 
                      ? `Last: ${new Date(feed.last_fetched).toLocaleString()}`
                      : 'Never fetched'
                    }
                  </span>
                  <button
                    onClick={toggleArticles}
                    className="flex items-center gap-1 hover:text-[hsl(var(--primary))] transition-colors"
                  >
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {feed.item_count || 0} items
                  </button>
                </>
              )}
            </div>

            {expanded && (
              <div className="mt-3 border-t border-stone-800 pt-3">
                {loadingArticles ? (
                  <div className="flex items-center gap-2 text-xs text-stone-500 py-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading articles…
                  </div>
                ) : articles.length === 0 ? (
                  <p className="text-xs text-stone-600 py-1">No articles found.</p>
                ) : (
                  <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {articles.map((article) => (
                      <li key={article.id} className="flex items-start gap-2">
                        <a
                          href={safeUrl(article.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-stone-300 hover:text-[hsl(var(--primary))] line-clamp-2 flex-1 leading-snug"
                        >
                          {decodeHtml(article.title)}
                        </a>
                        {article.published_date && (
                          <span className="text-[10px] text-stone-600 flex-shrink-0 mt-0.5">
                            {new Date(article.published_date).toLocaleDateString()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>

    <FeedAlertsDialog feed={feed} open={showAlerts} onOpenChange={setShowAlerts} />
    <SourceCleanupDialog
      feed={feed}
      health={currentHealth}
      open={cleanupOpen}
      onOpenChange={setCleanupOpen}
      onComplete={onRefresh}
    />
    </>
  );
}
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
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
  Loader2,
  Users
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
import { queryArticles } from '@/api/articles';

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

const HEALTH_DOT = {
  healthy: 'bg-emerald-400',
  degrading: 'bg-amber-400',
  failing: 'bg-red-400',
};

export default function FeedCard({ feed, onEdit, onDelete, onToggleStatus, onRefresh, onToggleShare }) {
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
    const items = await queryArticles({ feed_ids: [feed.id], sort: '-published_date', limit: 20 });
    setArticles(items);
    setLoadingArticles(false);
  };

  const isError = feed.status === 'error';
  const healthState = isError ? 'failing' : currentHealth?.health_state;
  const dotClass = HEALTH_DOT[healthState] || (feed.status === 'paused' ? 'bg-stone-500' : 'bg-emerald-400');
  const initial = (feed.name || '?').trim().charAt(0).toUpperCase();

  return (
    <>
    <RepairEscalationPanel feed={feed} />
    <div className={cn(
      'panel panel-hover p-4',
      isError && 'border-red-400/25 bg-red-400/[0.04]'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg font-display text-base font-semibold',
          isError ? 'bg-red-400/10 text-red-300' : 'bg-[hsl(var(--primary)/0.14)] text-[#C4A5FD]'
        )}>
          {initial}
          <span
            className={cn('absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-stone-950', dotClass)}
            aria-label={healthState ? `Health: ${healthState}` : undefined}
          />
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <h3 className="truncate text-[15px] font-semibold text-stone-100">
                  {feed.name}
                </h3>
                {(currentHealth || feed.paused_by_system) && <SourceHealthBadge health={currentHealth} feed={feed} compact />}
                {feed.workspace_id && (
                  <span className="chip-brand flex-shrink-0 gap-1" title="Shared with your team">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    Shared
                  </span>
                )}
              </div>
              <a 
                href={safeUrl(feed.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-2 block truncate font-mono text-[11px] text-stone-500 hover:text-[#C4A5FD]"
                title={feed.url}
              >
                {getDomain(feed.url)}
              </a>
              {currentHealth && <SourceActivityMetrics health={currentHealth} feed={feed} />}
            </div>
            
            <div className="flex items-center gap-1">
              {currentHealth && <SourceIssueIndicator issues={currentHealth.issues} />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-stone-500 hover:text-stone-100" aria-label="Source actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(feed)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowAlerts(true)}>
                    <Bell className="mr-2 h-4 w-4" />
                    Alerts
                  </DropdownMenuItem>
                  {currentHealth && (
                    <DropdownMenuItem onClick={() => setCleanupOpen(true)}>
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Health
                    </DropdownMenuItem>
                  )}
                <DropdownMenuItem onClick={() => window.open(safeUrl(feed.url), '_blank')}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open source
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleStatus(feed)}>
                  {feed.status === 'active' ? (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Activate
                    </>
                  )}
                </DropdownMenuItem>
                {onToggleShare && (
                  <DropdownMenuItem onClick={() => onToggleShare(feed)}>
                    <Users className="mr-2 h-4 w-4" />
                    {feed.workspace_id ? 'Stop sharing with team' : 'Share with team'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => onDelete(feed)}
                  className="text-red-400 focus:text-red-300"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {feed.category && <span className="chip-brand">{feed.category}</span>}
            {feed.tags?.map((tag) => (
              <span key={tag} className="chip-neutral">{tag}</span>
            ))}
          </div>

          <div className="meta mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {isError ? (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                Error fetching
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {feed.last_fetched 
                    ? `Last ${new Date(feed.last_fetched).toLocaleString()}`
                    : 'Never fetched'
                  }
                </span>
                <button
                  onClick={toggleArticles}
                  aria-expanded={expanded}
                  className="flex items-center gap-1 uppercase transition-colors hover:text-[#C4A5FD]"
                >
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {feed.item_count || 0} stories
                </button>
              </>
            )}
          </div>

          {expanded && (
            <div className="mt-3 border-t border-white/[0.07] pt-3">
              {loadingArticles ? (
                <div className="flex items-center gap-2 py-2 text-xs text-stone-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading stories…
                </div>
              ) : articles.length === 0 ? (
                <p className="py-1 text-xs text-stone-500">No stories found.</p>
              ) : (
                <ul className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {articles.map((article) => (
                    <li key={article.id} className="flex items-start gap-2">
                      <a
                        href={safeUrl(article.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="line-clamp-2 flex-1 text-xs leading-snug text-stone-300 hover:text-[#C4A5FD]"
                      >
                        {decodeHtml(article.title)}
                      </a>
                      {article.published_date && (
                        <span className="mt-0.5 flex-shrink-0 font-mono text-[10px] text-stone-500">
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
    </div>

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

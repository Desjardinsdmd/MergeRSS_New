import React from 'react';
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
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

const categoryColors = {
  CRE: 'bg-blue-100 text-blue-700',
  Markets: 'bg-green-100 text-green-700',
  Tech: 'bg-purple-100 text-purple-700',
  News: 'bg-orange-100 text-orange-700',
  Finance: 'bg-emerald-100 text-emerald-700',
  Crypto: 'bg-yellow-100 text-yellow-700',
  AI: 'bg-pink-100 text-pink-700',
  Other: 'bg-slate-100 text-slate-700',
};

export default function FeedCard({ feed, onEdit, onDelete, onToggleStatus }) {
  return (
    <Card className={cn(
      "border-slate-100 transition-all hover:shadow-md",
      feed.status === 'error' && "border-red-200 bg-red-50/30"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-10 h-10 flex items-center justify-center flex-shrink-0",
            feed.status === 'error' ? "bg-red-100" : "bg-[#171a20]"
          )}>
            <Rss className={cn(
              "w-5 h-5",
              feed.status === 'error' ? "text-red-600" : "text-white"
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-900 truncate">
                  {feed.name}
                </h3>
                <a 
                  href={feed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 hover:text-violet-600 truncate block"
                >
                  {feed.url}
                </a>
              </div>
              
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
                  <DropdownMenuItem onClick={() => window.open(feed.url, '_blank')}>
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

            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              {feed.status === 'error' ? (
                <span className="flex items-center gap-1 text-red-600">
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
                  <span>{feed.item_count || 0} items</span>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
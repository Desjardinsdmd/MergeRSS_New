import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, Pause, Play, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FeedCompactView({ feeds, selectedIds, onSelectionChange, onEdit, onDelete, onToggleStatus, onToggleShare }) {
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-4">
        <Checkbox
          checked={selectedIds.length === feeds.length && feeds.length > 0}
          onCheckedChange={handleSelectAll}
        />
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-stone-500">{selectedIds.length} selected</span>
      </div>
      {feeds.map((feed) => (
        <div
           key={feed.id}
           className="panel panel-hover flex items-center gap-3 rounded-xl p-3"
         >
          <Checkbox
            checked={selectedIds.includes(feed.id)}
            onCheckedChange={(checked) => handleSelectOne(feed.id, checked)}
          />
          <div className="flex-1 min-w-0">
            <p className="truncate font-semibold text-stone-100">{feed.name}</p>
             <div className="mt-1 flex items-center gap-2">
               {feed.status === 'active' ? (
                 <span className="chip border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">Active</span>
               ) : (
                 <span className="chip border border-amber-400/25 bg-amber-400/10 text-amber-300">Paused</span>
               )}
               <span className="font-mono text-[11px] text-stone-500">{feed.item_count || 0} stories</span>
             </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 rounded-lg" aria-label="Source actions">
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
        </div>
      ))}
    </div>
  );
}
import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FeedCompactView({ feeds, selectedIds, onSelectionChange, onEdit, onDelete, onToggleStatus }) {
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
        <span className="text-sm text-stone-500">{selectedIds.length} selected</span>
      </div>
      {feeds.map((feed) => (
        <div
           key={feed.id}
           className="flex items-center gap-3 p-3 border border-stone-800 rounded-lg hover:bg-stone-800 transition bg-stone-900"
         >
          <Checkbox
            checked={selectedIds.includes(feed.id)}
            onCheckedChange={(checked) => handleSelectOne(feed.id, checked)}
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-stone-200 truncate">{feed.name}</p>
             <div className="flex items-center gap-2 mt-1">
               <Badge variant={feed.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                 {feed.status === 'active' ? 'Active' : 'Paused'}
               </Badge>
               <span className="text-xs text-stone-500">{feed.item_count || 0} items</span>
             </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
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
              <DropdownMenuItem
                onClick={() => onDelete(feed)}
                className="text-red-600 focus:bg-red-50 focus:text-red-600"
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
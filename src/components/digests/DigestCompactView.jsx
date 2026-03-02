import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, Pause, Play, Globe, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DigestCompactView({
  digests,
  selectedIds,
  onSelectionChange,
  onEdit,
  onDelete,
  onToggleStatus,
  onSendTest,
  onMakePublic,
  sendingTest,
}) {
  const handleSelectAll = (checked) => {
    if (checked) {
      onSelectionChange(digests.map(d => d.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (digestId, checked) => {
    if (checked) {
      onSelectionChange([...selectedIds, digestId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== digestId));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-4">
        <Checkbox
          checked={selectedIds.length === digests.length && digests.length > 0}
          onCheckedChange={handleSelectAll}
        />
        <span className="text-sm text-slate-600">{selectedIds.length} selected</span>
      </div>
      {digests.map((digest) => (
        <div
          key={digest.id}
          className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
        >
          <Checkbox
            checked={selectedIds.includes(digest.id)}
            onCheckedChange={(checked) => handleSelectOne(digest.id, checked)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900 truncate">{digest.name}</p>
              {digest.is_public && (
                <Globe className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={digest.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                {digest.status === 'active' ? 'Active' : 'Paused'}
              </Badge>
              <span className="text-xs text-slate-500 capitalize">{digest.frequency}</span>
              <span className="text-xs text-slate-500">{digest.added_count || 0} added</span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(digest)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSendTest(digest)} disabled={sendingTest === digest.id}>
                <Zap className="w-4 h-4 mr-2" />
                Run Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMakePublic(digest)}>
                <Globe className="w-4 h-4 mr-2" />
                {digest.is_public ? 'Make Private' : 'Make Public'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleStatus(digest)}>
                {digest.status === 'active' ? (
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
                onClick={() => onDelete(digest)}
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
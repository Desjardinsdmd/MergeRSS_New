import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
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
          aria-label="Select all briefings"
        />
        <span className="meta"><span className="text-stone-300">{selectedIds.length}</span> selected</span>
      </div>
      {digests.map((digest) => (
        <div
           key={digest.id}
           className="panel panel-hover flex items-center gap-3 px-4 py-3"
         >
          <Checkbox
            checked={selectedIds.includes(digest.id)}
            onCheckedChange={(checked) => handleSelectOne(digest.id, checked)}
            aria-label={`Select ${digest.name}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
               <p className="font-semibold text-stone-100 truncate">{digest.name}</p>
               {digest.is_public && (
                 <Globe className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0" aria-label="Public" />
               )}
             </div>
             <div className="flex items-center gap-2 mt-1">
               <span className={digest.status === 'active' ? 'rounded-md border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-300' : 'rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-amber-400'}>
                 {digest.status === 'active' ? 'Active' : 'Paused'}
               </span>
               <span className="meta">{digest.frequency}</span>
               <span className="meta">{digest.added_count || 0} added</span>
             </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 rounded-lg text-stone-400 hover:text-stone-100" aria-label="Briefing options menu">
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
                Run now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMakePublic(digest)}>
                <Globe className="w-4 h-4 mr-2" />
                {digest.is_public ? 'Make private' : 'Make public'}
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
                className="text-red-400 focus:bg-red-400/10 focus:text-red-300"
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
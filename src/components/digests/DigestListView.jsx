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

export default function DigestListView({
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
    <div className="panel overflow-hidden">
      <table className="w-full">
        <thead className="border-b border-white/[0.06] bg-white/[0.02]">
          <tr>
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={selectedIds.length === digests.length && digests.length > 0}
                onCheckedChange={handleSelectAll}
                aria-label="Select all briefings"
              />
            </th>
            <th className="px-4 py-3 text-left micro-label">Name</th>
            <th className="px-4 py-3 text-left micro-label">Frequency</th>
            <th className="px-4 py-3 text-left micro-label">Status</th>
            <th className="px-4 py-3 text-left micro-label">Subscribers</th>
            <th className="w-10 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
           {digests.map((digest) => (
             <tr key={digest.id} className="hover:bg-white/[0.03] transition">
              <td className="px-4 py-3">
                <Checkbox
                  checked={selectedIds.includes(digest.id)}
                  onCheckedChange={(checked) => handleSelectOne(digest.id, checked)}
                  aria-label={`Select ${digest.name}`}
                />
              </td>
              <td className="px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                     <p className="font-semibold text-stone-100">{digest.name}</p>
                     {digest.is_public && (
                       <Globe className="w-4 h-4 text-[hsl(var(--primary))]" aria-label="Public" />
                     )}
                   </div>
                   <p className="text-xs text-stone-400">{digest.description}</p>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-stone-400">
                {digest.frequency}
              </td>
              <td className="px-4 py-3">
                <span className={digest.status === 'active' ? 'rounded-md border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-300' : 'rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-amber-400'}>
                  {digest.status === 'active' ? 'Active' : 'Paused'}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-sm text-stone-400">
                {digest.added_count || 0}
              </td>
              <td className="px-4 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-stone-400 hover:text-stone-100" aria-label="Briefing options menu">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
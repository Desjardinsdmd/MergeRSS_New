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
    <div className="border border-stone-800 rounded-lg overflow-hidden bg-stone-900">
      <table className="w-full">
        <thead className="bg-stone-800 border-b border-stone-800">
          <tr>
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={selectedIds.length === digests.length && digests.length > 0}
                onCheckedChange={handleSelectAll}
              />
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-stone-200">Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-stone-200">Frequency</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-stone-200">Status</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-stone-200">Subscribers</th>
            <th className="w-10 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-800">
           {digests.map((digest) => (
             <tr key={digest.id} className="hover:bg-stone-800 transition">
              <td className="px-4 py-3">
                <Checkbox
                  checked={selectedIds.includes(digest.id)}
                  onCheckedChange={(checked) => handleSelectOne(digest.id, checked)}
                />
              </td>
              <td className="px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                     <p className="font-medium text-stone-200">{digest.name}</p>
                     {digest.is_public && (
                       <Globe className="w-4 h-4 text-amber-400" />
                     )}
                   </div>
                   <p className="text-xs text-stone-500">{digest.description}</p>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-stone-500 capitalize">
                {digest.frequency}
              </td>
              <td className="px-4 py-3">
                <Badge variant={digest.status === 'active' ? 'default' : 'secondary'}>
                  {digest.status === 'active' ? 'Active' : 'Paused'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm text-stone-500">
                {digest.added_count || 0}
              </td>
              <td className="px-4 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
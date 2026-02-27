import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, Pause, Play, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FeedListView({ feeds, selectedIds, onSelectionChange, onEdit, onDelete, onToggleStatus }) {
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

  const categoryColors = {
    CRE: 'bg-blue-50 text-blue-700',
    Markets: 'bg-purple-50 text-purple-700',
    Tech: 'bg-pink-50 text-pink-700',
    News: 'bg-yellow-50 text-yellow-700',
    Finance: 'bg-green-50 text-green-700',
    Crypto: 'bg-orange-50 text-orange-700',
    AI: 'bg-indigo-50 text-indigo-700',
    Other: 'bg-slate-50 text-slate-700',
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={selectedIds.length === feeds.length && feeds.length > 0}
                onCheckedChange={handleSelectAll}
              />
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Category</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Items</th>
            <th className="w-10 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {feeds.map((feed) => (
            <tr key={feed.id} className="hover:bg-slate-50 transition">
              <td className="px-4 py-3">
                <Checkbox
                  checked={selectedIds.includes(feed.id)}
                  onCheckedChange={(checked) => handleSelectOne(feed.id, checked)}
                />
              </td>
              <td className="px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">{feed.name}</p>
                  <a
                    href={feed.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-500 hover:text-slate-700 truncate block max-w-xs"
                  >
                    {feed.url}
                  </a>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge className={categoryColors[feed.category]}>{feed.category}</Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant={feed.status === 'active' ? 'default' : 'secondary'}>
                  {feed.status === 'active' ? 'Active' : 'Paused'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {feed.item_count || 0}
              </td>
              <td className="px-4 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
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
                      <a href={feed.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open Feed
                      </a>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
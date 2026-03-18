import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, Pause, Play, ExternalLink, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { safeUrl, decodeHtml } from '@/components/utils/htmlUtils';
import { base44 } from '@/api/base44Client';

export default function FeedListView({ feeds, selectedIds, onSelectionChange, onEdit, onDelete, onToggleStatus }) {
  const [expandedFeedId, setExpandedFeedId] = useState(null);
  const [articlesByFeed, setArticlesByFeed] = useState({});
  const [loadingFeedId, setLoadingFeedId] = useState(null);

  const toggleFeed = async (feed) => {
    if (expandedFeedId === feed.id) { setExpandedFeedId(null); return; }
    setExpandedFeedId(feed.id);
    if (articlesByFeed[feed.id]) return;
    setLoadingFeedId(feed.id);
    const items = await base44.entities.FeedItem.filter({ feed_id: feed.id }, '-published_date', 20);
    setArticlesByFeed(prev => ({ ...prev, [feed.id]: items }));
    setLoadingFeedId(null);
  };

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
    CRE: 'bg-blue-950 text-blue-400',
    Markets: 'bg-purple-950 text-purple-400',
    Tech: 'bg-pink-950 text-pink-400',
    News: 'bg-yellow-950 text-yellow-400',
    Finance: 'bg-green-950 text-green-400',
    Crypto: 'bg-orange-950 text-orange-400',
    AI: 'bg-indigo-950 text-indigo-400',
    Other: 'bg-stone-800 text-stone-300',
  };

  return (
    <div className="border border-stone-800 rounded-lg overflow-x-auto bg-stone-900">
      <table className="w-full min-w-[600px]">
        <thead className="bg-stone-800 border-b border-stone-800">
          <tr>
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={selectedIds.length === feeds.length && feeds.length > 0}
                onCheckedChange={handleSelectAll}
              />
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-stone-200">Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-stone-200">Category</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-stone-200">Status</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-stone-200">Items</th>
            <th className="w-10 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-800">
           {feeds.map((feed) => (
             <React.Fragment key={feed.id}>
             <tr className="hover:bg-stone-800 transition">
              <td className="px-4 py-3">
                <Checkbox
                  checked={selectedIds.includes(feed.id)}
                  onCheckedChange={(checked) => handleSelectOne(feed.id, checked)}
                />
              </td>
              <td className="px-4 py-3">
                <div>
                  <p className="font-medium text-stone-200">{feed.name}</p>
                   <a
                     href={safeUrl(feed.url)}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="text-xs text-stone-500 hover:text-stone-400 truncate block max-w-xs"
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
              <td className="px-4 py-3 text-sm text-stone-500">
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
                      <a href={safeUrl(feed.url)} target="_blank" rel="noopener noreferrer">
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
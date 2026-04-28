import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Inbox } from 'lucide-react';
import PostReviewCard from '@/components/publications/PostReviewCard';


export default function PublicationInbox() {
  const params = new URLSearchParams(window.location.search);
  const pubId = params.get('id');
  const [user, setUser] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: pubsRaw = [] } = useQuery({
    queryKey: ['pub-detail', pubId, user?.email],
    queryFn: () => base44.entities.Publication.filter({ id: pubId }, '-created_date', 1),
    enabled: !!pubId && !!user,
  });
  const pubs = Array.isArray(pubsRaw) ? pubsRaw : (pubsRaw?.items || pubsRaw?.data || []);
  const pub = pubs[0];

  const { data: postsRaw = [], isLoading } = useQuery({
    queryKey: ['pub-posts', pubId, statusFilter, user?.email],
    queryFn: () => {
      const filter = { publication_id: pubId };
      if (statusFilter !== 'all') filter.status = statusFilter;
      return base44.entities.PublicationPost.filter(filter, '-created_date', 50);
    },
    enabled: !!pubId && !!user,
  });
  const posts = Array.isArray(postsRaw) ? postsRaw : (postsRaw?.items || postsRaw?.data || []);

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['pub-posts'] });
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/Publications">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-stone-100">{pub?.name || 'Publication'} — Inbox</h1>
          <p className="text-stone-500 text-sm">Review and approve generated drafts</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-stone-800 border-stone-700 text-stone-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Drafts</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-stone-500">{posts.length} posts</Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Inbox className="w-10 h-10 text-stone-600 mb-3" />
          <p className="text-stone-400 mb-1">No posts yet</p>
          <p className="text-stone-600 text-sm">Run the scheduler or wait for the next scheduled run to generate drafts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <PostReviewCard key={post.id} post={post} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
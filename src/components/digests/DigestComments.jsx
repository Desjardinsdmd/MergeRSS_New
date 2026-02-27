import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DigestComments({ digestId }) {
  const [user, setUser] = useState(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['digest-comments', digestId],
    queryFn: () => base44.entities.DigestComment.filter({ digest_id: digestId }, 'created_date'),
    enabled: !!digestId,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handlePost = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    await base44.entities.DigestComment.create({
      digest_id: digestId,
      content: text.trim(),
      author_name: user?.full_name || user?.email || 'Unknown',
      author_email: user?.email || '',
    });
    queryClient.invalidateQueries({ queryKey: ['digest-comments', digestId] });
    setText('');
    setPosting(false);
  };

  const handleDelete = async (comment) => {
    if (comment.author_email !== user?.email && user?.role !== 'admin') return;
    await base44.entities.DigestComment.delete(comment.id);
    queryClient.invalidateQueries({ queryKey: ['digest-comments', digestId] });
    toast.success('Comment deleted');
  };

  return (
    <div className="border-t border-slate-100 pt-4 mt-4">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-3">
        <MessageSquare className="w-4 h-4 text-slate-400" />
        Discussion
        {comments.length > 0 && (
          <span className="text-xs font-normal text-slate-400 ml-1">({comments.length})</span>
        )}
      </h4>

      {/* Comments list */}
      <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
          </div>
        )}
        {!isLoading && comments.length === 0 && (
          <p className="text-xs text-slate-400 italic">No comments yet. Start the discussion!</p>
        )}
        {comments.map((comment) => {
          const isOwn = comment.author_email === user?.email;
          const canDelete = isOwn || user?.role === 'admin';
          return (
            <div key={comment.id} className="flex gap-2 group">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700 flex-shrink-0 mt-0.5">
                {comment.author_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-slate-800">{comment.author_name}</span>
                  <span className="text-[10px] text-slate-400">{timeAgo(comment.created_date)}</span>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(comment)}
                      className="ml-auto opacity-0 group-hover:opacity-100 transition text-slate-300 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{comment.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePost(); }
          }}
          placeholder="Add a comment..."
          className="resize-none text-xs rounded-lg min-h-0 h-8 py-1.5 leading-tight"
          rows={1}
        />
        <Button
          onClick={handlePost}
          disabled={!text.trim() || posting}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 rounded-lg h-8 px-3 flex-shrink-0"
        >
          {posting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}
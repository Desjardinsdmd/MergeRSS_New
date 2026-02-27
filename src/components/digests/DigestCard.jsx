import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import DigestComments from '@/components/digests/DigestComments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  Pause,
  Play,
  Send,
  Clock,
  Slack,
  MessageCircle,
  Inbox,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DigestCard({ digest, onEdit, onDelete, onToggleStatus, onSendTest }) {
  const [showComments, setShowComments] = useState(false);
  const frequencyLabel = digest.frequency === 'daily' ? 'Daily' : 'Weekly';
  
  return (
    <Card className={cn(
      "border-slate-100 transition-all hover:shadow-md",
      digest.status === 'paused' && "opacity-60"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-[#171a20] flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">{digest.name}</h3>
                {digest.description && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                    {digest.description}
                  </p>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(digest)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSendTest(digest)}>
                    <Send className="w-4 h-4 mr-2" />
                    Send Test
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
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Categories */}
            {digest.categories?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {digest.categories.slice(0, 3).map((cat) => (
                  <Badge key={cat} variant="secondary" className="text-xs">
                    {cat}
                  </Badge>
                ))}
                {digest.categories.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{digest.categories.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Schedule & Delivery */}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {frequencyLabel} at {digest.schedule_time || '09:00'}
              </span>

              <div className="flex items-center gap-1">
                {digest.delivery_web && (
                  <Badge variant="outline" className="text-xs gap-1 px-1.5">
                    <Inbox className="w-3 h-3" />
                  </Badge>
                )}
                {digest.delivery_slack && (
                  <Badge variant="outline" className="text-xs gap-1 px-1.5 border-[#4A154B]/30 text-[#4A154B]">
                    <Slack className="w-3 h-3" />
                  </Badge>
                )}
                {digest.delivery_discord && (
                  <Badge variant="outline" className="text-xs gap-1 px-1.5 border-[#5865F2]/30 text-[#5865F2]">
                    <MessageCircle className="w-3 h-3" />
                  </Badge>
                )}
              </div>
            </div>

            {/* Last sent */}
            {digest.last_sent && (
              <p className="text-xs text-slate-400 mt-2">
                Last sent: {new Date(digest.last_sent).toLocaleString()}
              </p>
            )}

            {/* Toggle comments */}
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1 mt-3 text-xs text-slate-400 hover:text-indigo-600 transition"
            >
              <MessageCircle className="w-3 h-3" />
              Discussion
              <ChevronDown className={cn("w-3 h-3 transition-transform", showComments && "rotate-180")} />
            </button>
          </div>
        </div>

        {showComments && <DigestComments digestId={digest.id} />}
      </CardContent>
    </Card>
  );
}
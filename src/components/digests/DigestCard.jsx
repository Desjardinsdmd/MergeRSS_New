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
  MessageCircle,
  Inbox,
  ChevronDown,
  Globe,
  Mail
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DigestCard({ digest, onEdit, onDelete, onToggleStatus, onSendTest, onMakePublic, isSending }) {
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
                   <DropdownMenuItem onClick={() => onMakePublic?.(digest)}>
                     <Globe className="w-4 h-4 mr-2" />
                     {digest.is_public ? 'Make Private' : 'Make Public'}
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
                {digest.delivery_email && (
                  <Badge variant="outline" className="text-xs gap-1 px-1.5 border-orange-200 text-orange-600">
                    <Mail className="w-3 h-3" />
                  </Badge>
                )}
                {digest.delivery_slack && (
                  <Badge variant="outline" className="text-xs gap-1 px-1.5 border-[#4A154B]/30 text-[#4A154B]">
                    <svg className="w-3 h-3 fill-current" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">
                      <path d="M27.2 80c0 7.5-6.1 13.6-13.6 13.6S0 87.5 0 80c0-7.5 6.1-13.6 13.6-13.6h13.6V80zm6.8 0c0-7.5 6.1-13.6 13.6-13.6 7.5 0 13.6 6.1 13.6 13.6v34c0 7.5-6.1 13.6-13.6 13.6-7.5 0-13.6-6.1-13.6-13.6V80z"/>
                      <path d="M47 27.2c-7.5 0-13.6-6.1-13.6-13.6S39.5 0 47 0c7.5 0 13.6 6.1 13.6 13.6v13.6H47zm0 6.8c7.5 0 13.6 6.1 13.6 13.6 0 7.5-6.1 13.6-13.6 13.6H13c-7.5 0-13.6-6.1-13.6-13.6 0-7.5 6.1-13.6 13.6-13.6h34z"/>
                    </svg>
                  </Badge>
                )}
                {digest.delivery_discord && (
                  <Badge variant="outline" className="text-xs gap-1 px-1.5 border-[#5865F2]/30 text-[#5865F2]">
                    <svg className="w-3 h-3 fill-current" viewBox="0 0 127 96" xmlns="http://www.w3.org/2000/svg">
                      <path d="M107.7 8.07A105.2 105.2 0 0 0 83 0a72.6 72.6 0 0 0-3.36 6.83 97.7 97.7 0 0 0-29.3 0A72.6 72.6 0 0 0 47 0a105.2 105.2 0 0 0-24.7 8.07 106.3 106.3 0 0 0-16.6 64.3c0 .46 0 .92.05 1.38a105.2 105.2 0 0 0 32.2 16.3 74.1 74.1 0 0 0 6.44-10.6 69.4 69.4 0 0 1-10.2-4.9c.86-.6 1.7-1.23 2.5-1.88 19.8 9.2 41.2 9.2 60.8 0 .8.65 1.64 1.27 2.5 1.88a69.4 69.4 0 0 1-10.2 4.9 74.1 74.1 0 0 0 6.44 10.6 105.2 105.2 0 0 0 32.2-16.3c.03-.46.05-.92.05-1.38a106.3 106.3 0 0 0-16.6-64.3zM42.8 52.3c-5.8 0-10.6-5.3-10.6-11.8 0-6.5 4.7-11.8 10.6-11.8 5.9 0 10.6 5.3 10.6 11.8 0 6.5-4.7 11.8-10.6 11.8zm40.8 0c-5.8 0-10.6-5.3-10.6-11.8 0-6.5 4.7-11.8 10.6-11.8 5.9 0 10.6 5.3 10.6 11.8 0 6.5-4.7 11.8-10.6 11.8z"/>
                    </svg>
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
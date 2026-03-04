import React, { useState } from 'react';
import { CheckSquare, Square, MailOpen, Mail, Star, StarOff, FolderInput, Tag, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from '@/components/ui/dropdown-menu';

export default function InboxToolbar({ selectedIds, allIds, onSelectAll, onDeselectAll, onMarkRead, onMarkUnread, onFavorite, onUnfavorite, onMoveToFolder, onAddTag, folders, tags }) {
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;
  const someSelected = selectedIds.length > 0;

  return (
    <div className="flex items-center gap-2 py-2 px-1 border-b border-stone-800 bg-stone-900 sticky top-0 z-10 flex-wrap">
      <button
        onClick={allSelected ? onDeselectAll : onSelectAll}
        className="text-stone-400 hover:text-stone-200 transition p-1"
        title={allSelected ? 'Deselect all' : 'Select all'}
      >
        {allSelected ? <CheckSquare className="w-4 h-4 text-[hsl(var(--primary))]" /> : <Square className="w-4 h-4" />}
      </button>

      {someSelected && (
        <>
          <span className="text-xs text-stone-400 font-medium whitespace-nowrap">{selectedIds.length} selected</span>

          {/* Mobile: collapse all actions into one dropdown */}
          <div className="flex sm:hidden ml-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                  Actions <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={onMarkRead} className="text-sm gap-2">
                  <MailOpen className="w-3.5 h-3.5" /> Mark read
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMarkUnread} className="text-sm gap-2">
                  <Mail className="w-3.5 h-3.5" /> Mark unread
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onFavorite} className="text-sm gap-2">
                  <Star className="w-3.5 h-3.5" /> Star
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onUnfavorite} className="text-sm gap-2">
                  <StarOff className="w-3.5 h-3.5" /> Unstar
                </DropdownMenuItem>
                {['Inbox', ...folders].length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs">Move to folder</DropdownMenuLabel>
                    {['Inbox', ...folders].map(f => (
                      <DropdownMenuItem key={f} onClick={() => onMoveToFolder(f)} className="text-sm gap-2">
                        <FolderInput className="w-3.5 h-3.5" /> {f}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {tags.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs">Apply tag</DropdownMenuLabel>
                    {tags.map(t => (
                      <DropdownMenuItem key={t} onClick={() => onAddTag(t)} className="text-sm gap-2">
                        <Tag className="w-3.5 h-3.5" /> {t}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop: show all buttons inline */}
          <div className="hidden sm:flex items-center gap-1 ml-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onMarkRead}>
              <MailOpen className="w-3.5 h-3.5" /> Mark read
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onMarkUnread}>
              <Mail className="w-3.5 h-3.5" /> Mark unread
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onFavorite}>
              <Star className="w-3.5 h-3.5" /> Star
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onUnfavorite}>
              <StarOff className="w-3.5 h-3.5" /> Unstar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                  <FolderInput className="w-3.5 h-3.5" /> Move <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel className="text-xs">Move to folder</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {['Inbox', ...folders].map(f => (
                  <DropdownMenuItem key={f} onClick={() => onMoveToFolder(f)} className="text-sm">{f}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {tags.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                    <Tag className="w-3.5 h-3.5" /> Tag <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel className="text-xs">Apply tag</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {tags.map(t => (
                    <DropdownMenuItem key={t} onClick={() => onAddTag(t)} className="text-sm">{t}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </>
      )}
    </div>
  );
}
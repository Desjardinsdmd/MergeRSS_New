import React, { useState } from 'react';
import { Inbox, Star, Tag, Folder, Plus, Trash2, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function InboxFolderSidebar({ folders, tags, selectedFolder, selectedTag, onSelectFolder, onSelectTag, unreadCounts, onCreateFolder, onDeleteFolder, onCreateTag, onDeleteTag }) {
  const [newFolderName, setNewFolderName] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewTag, setShowNewTag] = useState(false);

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  const handleCreateTag = () => {
    if (newTagName.trim()) {
      onCreateTag(newTagName.trim());
      setNewTagName('');
      setShowNewTag(false);
    }
  };

  return (
    <div className="w-52 flex-shrink-0 space-y-1">
      {/* System folders */}
      <div className="mb-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-1">Folders</p>
        {[
          { name: 'Inbox', icon: Inbox },
          { name: 'Starred', icon: Star },
        ].map(({ name, icon: Icon }) => (
          <button
            key={name}
            onClick={() => { onSelectFolder(name); onSelectTag(null); }}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              selectedFolder === name && !selectedTag
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <span className="flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {name}
            </span>
            {(unreadCounts?.[name] || 0) > 0 && (
              <span className="text-xs bg-indigo-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                {unreadCounts[name]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Custom folders */}
      <div className="mb-2">
        <div className="flex items-center justify-between px-2 mb-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">My Folders</p>
          <button onClick={() => setShowNewFolder(true)} className="text-slate-400 hover:text-indigo-600 transition">
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {showNewFolder && (
          <div className="flex items-center gap-1 px-2 mb-1">
            <Input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Folder name..."
              className="h-7 text-xs"
              autoFocus
            />
            <button onClick={handleCreateFolder} className="text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
            <button onClick={() => setShowNewFolder(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
        )}

        {folders.map(folder => (
          <button
            key={folder}
            onClick={() => { onSelectFolder(folder); onSelectTag(null); }}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
              selectedFolder === folder && !selectedTag
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Folder className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{folder}</span>
            </span>
            <span className="flex items-center gap-1">
              {(unreadCounts?.[folder] || 0) > 0 && (
                <span className="text-xs bg-indigo-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {unreadCounts[folder]}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); onDeleteFolder(folder); }}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          </button>
        ))}
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between px-2 mb-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Tags</p>
          <button onClick={() => setShowNewTag(true)} className="text-slate-400 hover:text-indigo-600 transition">
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {showNewTag && (
          <div className="flex items-center gap-1 px-2 mb-1">
            <Input
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
              placeholder="Tag name..."
              className="h-7 text-xs"
              autoFocus
            />
            <button onClick={handleCreateTag} className="text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
            <button onClick={() => setShowNewTag(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
        )}

        {tags.map(tag => (
          <button
            key={tag}
            onClick={() => { onSelectTag(tag); onSelectFolder(null); }}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
              selectedTag === tag
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Tag className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{tag}</span>
            </span>
            <button
              onClick={e => { e.stopPropagation(); onDeleteTag(tag); }}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
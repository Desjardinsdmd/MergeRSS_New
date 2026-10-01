import React, { useState } from 'react';
import { Inbox, Star, Tag, Folder, Plus, Trash2, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { MicroLabel } from '@/components/brand/Brand';

const itemClass = (active) => cn(
  'nav-item w-full justify-between gap-2 border border-transparent text-sm font-medium group',
  active && 'nav-item-active'
);

function Count({ n }) {
  if (!n) return null;
  return <span className="font-mono text-[11px] text-emerald-400">{n}</span>;
}

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
    <div className="w-56 flex-shrink-0 space-y-5">
      {/* System folders */}
      <div>
        <MicroLabel className="px-3 mb-2">Folders</MicroLabel>
        <div className="space-y-0.5">
          {[
            { name: 'Inbox', icon: Inbox },
            { name: 'Starred', icon: Star },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => { onSelectFolder(name); onSelectTag(null); }}
              className={itemClass(selectedFolder === name && !selectedTag)}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="w-4 h-4" />
                {name}
              </span>
              <Count n={unreadCounts?.[name] || 0} />
            </button>
          ))}
        </div>
      </div>

      {/* Custom folders */}
      <div>
        <div className="flex items-center justify-between px-3 mb-2">
          <MicroLabel>My folders</MicroLabel>
          <button
            onClick={() => setShowNewFolder(true)}
            aria-label="New folder"
            className="rounded-md p-0.5 text-stone-500 hover:bg-white/[0.05] hover:text-stone-100 transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {showNewFolder && (
          <div className="flex items-center gap-1 px-1 mb-1">
            <Input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Folder name..."
              className="h-8 rounded-xl text-xs"
              autoFocus
            />
            <button onClick={handleCreateFolder} aria-label="Create folder" className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
            <button onClick={() => setShowNewFolder(false)} aria-label="Cancel" className="text-stone-500 hover:text-stone-300"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="space-y-0.5">
          {folders.map(folder => (
            <button
              key={folder}
              onClick={() => { onSelectFolder(folder); onSelectTag(null); }}
              className={itemClass(selectedFolder === folder && !selectedTag)}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Folder className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{folder}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Count n={unreadCounts?.[folder] || 0} />
                <button
                  onClick={e => { e.stopPropagation(); onDeleteFolder(folder); }}
                  aria-label={`Delete folder ${folder}`}
                  className="opacity-0 group-hover:opacity-100 text-stone-500 hover:text-red-400 transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between px-3 mb-2">
          <MicroLabel>Tags</MicroLabel>
          <button
            onClick={() => setShowNewTag(true)}
            aria-label="New tag"
            className="rounded-md p-0.5 text-stone-500 hover:bg-white/[0.05] hover:text-stone-100 transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {showNewTag && (
          <div className="flex items-center gap-1 px-1 mb-1">
            <Input
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
              placeholder="Tag name..."
              className="h-8 rounded-xl text-xs"
              autoFocus
            />
            <button onClick={handleCreateTag} aria-label="Create tag" className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
            <button onClick={() => setShowNewTag(false)} aria-label="Cancel" className="text-stone-500 hover:text-stone-300"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="space-y-0.5">
          {tags.map(tag => (
            <button
              key={tag}
              onClick={() => { onSelectTag(tag); onSelectFolder(null); }}
              className={itemClass(selectedTag === tag)}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Tag className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{tag}</span>
              </span>
              <button
                onClick={e => { e.stopPropagation(); onDeleteTag(tag); }}
                aria-label={`Delete tag ${tag}`}
                className="opacity-0 group-hover:opacity-100 text-stone-500 hover:text-red-400 transition"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

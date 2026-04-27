import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Plus, Trash2, Loader2, BookOpen, Star } from 'lucide-react';
import { toast } from 'sonner';

export default function PublicationVoice() {
  const params = new URLSearchParams(window.location.search);
  const pubId = params.get('id');
  const [user, setUser] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPromote, setShowPromote] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ content: '', label: '', note: '' });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: pubsRaw = [] } = useQuery({
    queryKey: ['voice-pub', pubId, user?.email],
    queryFn: () => base44.entities.Publication.filter({ id: pubId, created_by: user.email }, '-created_date', 1),
    enabled: !!pubId && !!user,
  });
  const pub = (Array.isArray(pubsRaw) ? pubsRaw : (pubsRaw?.items || pubsRaw?.data || []))[0];

  const { data: examplesRaw = [], isLoading } = useQuery({
    queryKey: ['voice-examples', pubId, user?.email],
    queryFn: () => base44.entities.PublicationVoiceExample.filter({ publication_id: pubId, created_by: user.email }, '-created_date', 50),
    enabled: !!pubId && !!user,
  });
  const examples = Array.isArray(examplesRaw) ? examplesRaw : (examplesRaw?.items || examplesRaw?.data || []);

  // Load posted items for "Promote from posted"
  const { data: postedRaw = [] } = useQuery({
    queryKey: ['voice-posted', pubId, user?.email],
    queryFn: () => base44.entities.PublicationPost.filter({ publication_id: pubId, status: 'posted', created_by: user.email }, '-posted_at', 20),
    enabled: !!pubId && !!user && showPromote,
  });
  const postedPosts = Array.isArray(postedRaw) ? postedRaw : (postedRaw?.items || postedRaw?.data || []);

  const handleAdd = async () => {
    if (!form.content.trim()) { toast.error('Content is required'); return; }
    setSaving(true);
    const contentLines = form.content.split('\n---\n').filter(Boolean);
    await base44.entities.PublicationVoiceExample.create({
      publication_id: pubId,
      example_content: contentLines,
      example_label: form.label || 'post',
      performance_note: form.note || '',
      use_in_prompts: true,
    });
    queryClient.invalidateQueries({ queryKey: ['voice-examples'] });
    setShowAdd(false);
    setForm({ content: '', label: '', note: '' });
    setSaving(false);
    toast.success('Voice example added');
  };

  const handlePromote = async (post) => {
    const content = post.final_content || post.draft_variants?.[post.chosen_variant_index ?? 0]?.content || [];
    await base44.entities.PublicationVoiceExample.create({
      publication_id: pubId,
      example_content: content,
      example_label: post.draft_variants?.[post.chosen_variant_index ?? 0]?.label || 'post',
      performance_note: 'Promoted from posted content',
      use_in_prompts: true,
    });
    queryClient.invalidateQueries({ queryKey: ['voice-examples'] });
    toast.success('Added to voice library');
  };

  const handleToggle = async (example, value) => {
    await base44.entities.PublicationVoiceExample.update(example.id, { use_in_prompts: value });
    queryClient.invalidateQueries({ queryKey: ['voice-examples'] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.PublicationVoiceExample.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ['voice-examples'] });
    setDeleteTarget(null);
    toast.success('Example removed');
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/Publications">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-stone-100">{pub?.name || 'Publication'} — Voice Library</h1>
          <p className="text-stone-500 text-sm">Manage few-shot examples that shape the AI writing voice</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Button onClick={() => setShowAdd(true)} className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
          <Plus className="w-4 h-4 mr-2" /> Add Example
        </Button>
        <Button variant="outline" onClick={() => setShowPromote(true)}>
          <Star className="w-4 h-4 mr-2" /> Promote from Posted
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>
      ) : examples.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <BookOpen className="w-10 h-10 text-stone-600 mb-3" />
          <p className="text-stone-400 mb-1">No voice examples yet</p>
          <p className="text-stone-600 text-sm">Add examples to teach the AI your preferred writing style.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {examples.map(ex => (
            <Card key={ex.id} className="border-stone-800 bg-stone-900">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">{ex.example_label || 'post'}</Badge>
                      <Badge variant={ex.use_in_prompts ? 'default' : 'outline'} className="text-xs">
                        {ex.use_in_prompts ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    {(ex.example_content || []).map((line, i) => (
                      <p key={i} className="text-sm text-stone-300 mb-1">{line}</p>
                    ))}
                    {ex.performance_note && (
                      <p className="text-xs text-stone-600 mt-2 italic">{ex.performance_note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={ex.use_in_prompts} onCheckedChange={v => handleToggle(ex, v)} />
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(ex)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Voice Example</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-stone-400">Content *</Label>
              <Textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
                rows={6} placeholder="Paste example post content. For threads, separate posts with ---"
                className="bg-stone-800 border-stone-700 text-stone-100 text-sm" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-stone-400">Label</Label>
                <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. wire, thread, take" className="bg-stone-800 border-stone-700 text-stone-100" />
              </div>
              <div>
                <Label className="text-stone-400">Why it's good</Label>
                <Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="Performance note" className="bg-stone-800 border-stone-700 text-stone-100" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Add Example
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote Dialog */}
      <Dialog open={showPromote} onOpenChange={setShowPromote}>
        <DialogContent className="sm:max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Promote from Posted</DialogTitle></DialogHeader>
          {postedPosts.length === 0 ? (
            <p className="text-stone-500 text-sm py-4">No posted items found for this publication.</p>
          ) : (
            <div className="space-y-3 py-2">
              {postedPosts.map(post => {
                const content = post.final_content || post.draft_variants?.[post.chosen_variant_index ?? 0]?.content || [];
                return (
                  <div key={post.id} className="border border-stone-700 rounded-lg p-3">
                    {content.map((line, i) => (
                      <p key={i} className="text-sm text-stone-300 mb-1">{line}</p>
                    ))}
                    <div className="flex justify-end mt-2">
                      <Button size="sm" variant="outline" onClick={() => { handlePromote(post); setShowPromote(false); }}>
                        <Star className="w-3 h-3 mr-1" /> Add to Library
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Voice Example</AlertDialogTitle>
            <AlertDialogDescription>This example will be permanently removed from the voice library.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
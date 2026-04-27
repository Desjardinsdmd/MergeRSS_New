import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_PROMPT = `LENS: [Your Lens Name]
You are scoring for [describe your audience].

Score against: "[What question does this lens answer?]"
- 90-100: [Describe highest importance]
- 70-89: [Describe high importance]
- 50-69: [Describe moderate importance]
- Below 50: [Describe low importance]

intelligence_tag rules:
- "Opportunity" ONLY for [specific criteria]
- "Risk" for [specific criteria]
- "Trending" for [specific criteria]
- "Neutral" for background context`;

export default function LensForm({ lens, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    audience_description: '',
    scoring_prompt: DEFAULT_PROMPT,
    feed_filter_tags: [],
    feed_filter_categories: [],
    minimum_score_threshold: 50,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [tagInput, setTagInput] = useState('');

  const { data: feeds = [] } = useQuery({
    queryKey: ['user-feeds-for-lens'],
    queryFn: () => base44.entities.Feed.filter({}, '-created_date', 200),
  });

  const allCategories = [...new Set(feeds.map(f => f.category).filter(Boolean))];
  const allTags = [...new Set(feeds.flatMap(f => f.tags || []).filter(Boolean))];

  useEffect(() => {
    if (lens) {
      setForm({
        name: lens.name || '',
        description: lens.description || '',
        audience_description: lens.audience_description || '',
        scoring_prompt: lens.scoring_prompt || DEFAULT_PROMPT,
        feed_filter_tags: lens.feed_filter_tags || [],
        feed_filter_categories: lens.feed_filter_categories || [],
        minimum_score_threshold: lens.minimum_score_threshold ?? 50,
        is_active: lens.is_active !== false,
      });
    }
  }, [lens]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.scoring_prompt.trim()) {
      toast.error('Name and scoring prompt are required');
      return;
    }
    setSaving(true);
    const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const data = { ...form, slug };
    if (lens?.id) {
      await base44.entities.CustomLens.update(lens.id, data);
    } else {
      await base44.entities.CustomLens.create(data);
    }
    setSaving(false);
    onSave();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResults(null);
    const recentItems = await base44.entities.FeedItem.filter(
      { enrichment_status: 'done' }, '-published_date', 5
    );
    const items = Array.isArray(recentItems) ? recentItems : (recentItems?.items || recentItems?.data || []);
    if (!items.length) {
      toast.error('No enriched items found to test against');
      setTesting(false);
      return;
    }
    const articles = items.slice(0, 5).map((item, i) => ({
      index: i, title: (item.title || '').slice(0, 200),
      description: (item.description || '').slice(0, 400),
    }));
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${form.scoring_prompt}\n\nFor each article, return ai_summary, importance_score (0-100), intelligence_tag.\n\nArticles:\n${JSON.stringify(articles, null, 2)}`,
      response_json_schema: {
        type: "object",
        properties: {
          results: { type: "array", items: { type: "object", properties: {
            index: { type: "number" }, ai_summary: { type: "string" },
            importance_score: { type: "number" }, intelligence_tag: { type: "string" }
          }}}
        }
      }
    });
    setTestResults((result?.results || []).map((r, i) => ({ ...r, title: articles[i]?.title })));
    setTesting(false);
  };

  const toggleCategory = (cat) => {
    setForm(prev => ({
      ...prev,
      feed_filter_categories: prev.feed_filter_categories.includes(cat)
        ? prev.feed_filter_categories.filter(c => c !== cat)
        : [...prev.feed_filter_categories, cat]
    }));
  };

  const addTag = (tag) => {
    if (tag && !form.feed_filter_tags.includes(tag)) {
      setForm(prev => ({ ...prev, feed_filter_tags: [...prev.feed_filter_tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    setForm(prev => ({ ...prev, feed_filter_tags: prev.feed_filter_tags.filter(t => t !== tag) }));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-stone-400">Lens Name *</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Defense Tech Investor" className="bg-stone-800 border-stone-700 text-stone-100" />
        </div>
        <div>
          <Label className="text-stone-400">Audience Description</Label>
          <Input value={form.audience_description} onChange={e => setForm({ ...form, audience_description: e.target.value })}
            placeholder="Who is this lens scoring for?" className="bg-stone-800 border-stone-700 text-stone-100" />
        </div>
      </div>

      <div>
        <Label className="text-stone-400">Description</Label>
        <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="Brief description of this lens" className="bg-stone-800 border-stone-700 text-stone-100" />
      </div>

      <div>
        <Label className="text-stone-400">Scoring Prompt *</Label>
        <Textarea value={form.scoring_prompt} onChange={e => setForm({ ...form, scoring_prompt: e.target.value })}
          rows={12} className="bg-stone-800 border-stone-700 text-stone-100 font-mono text-sm" />
        <p className="text-xs text-stone-600 mt-1">This prompt is sent to the LLM to score each article. Be specific about what matters.</p>
      </div>

      <div>
        <Label className="text-stone-400">Feed Categories (filter)</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {allCategories.map(cat => (
            <Badge key={cat} variant={form.feed_filter_categories.includes(cat) ? 'default' : 'outline'}
              className="cursor-pointer" onClick={() => toggleCategory(cat)}>
              {cat}
            </Badge>
          ))}
          {!allCategories.length && <p className="text-xs text-stone-600">No feed categories found</p>}
        </div>
        <p className="text-xs text-stone-600 mt-1">Leave empty to score all feeds. Selected categories will filter which feeds this lens applies to.</p>
      </div>

      <div>
        <Label className="text-stone-400">Feed Tags (filter)</Label>
        <div className="flex flex-wrap gap-2 mt-2 mb-2">
          {form.feed_filter_tags.map(tag => (
            <Badge key={tag} className="gap-1">
              {tag}
              <X className="w-3 h-3 cursor-pointer" onClick={() => removeTag(tag)} />
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
            placeholder="Type or select a tag" className="bg-stone-800 border-stone-700 text-stone-100 flex-1"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput.trim()); }}}
            list="tag-suggestions" />
          <datalist id="tag-suggestions">
            {allTags.filter(t => !form.feed_filter_tags.includes(t)).map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
      </div>

      <div>
        <Label className="text-stone-400">Minimum Score Threshold: {form.minimum_score_threshold}</Label>
        <Slider value={[form.minimum_score_threshold]} onValueChange={v => setForm({ ...form, minimum_score_threshold: v[0] })}
          min={0} max={100} step={5} className="mt-2" />
        <p className="text-xs text-stone-600 mt-1">Items scoring below this won't be eligible as publication candidates.</p>
      </div>

      {/* Test Section */}
      <div className="border border-stone-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-stone-300 flex items-center gap-2">
            <FlaskConical className="w-4 h-4" /> Test Lens
          </h4>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !form.scoring_prompt}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {testing ? 'Testing...' : 'Run Test'}
          </Button>
        </div>
        {testResults && (
          <div className="space-y-2">
            {testResults.map((r, i) => (
              <div key={i} className="bg-stone-800 rounded p-3 text-sm">
                <p className="font-medium text-stone-200 truncate">{r.title}</p>
                <div className="flex items-center gap-3 mt-1">
                  <Badge variant="outline">{r.importance_score}</Badge>
                  <Badge className={r.intelligence_tag === 'Risk' ? 'bg-red-900/30 text-red-400' :
                    r.intelligence_tag === 'Opportunity' ? 'bg-green-900/30 text-green-400' :
                    r.intelligence_tag === 'Trending' ? 'bg-blue-900/30 text-blue-400' : 'bg-stone-700 text-stone-400'}>
                    {r.intelligence_tag}
                  </Badge>
                </div>
                <p className="text-stone-500 mt-1 text-xs">{r.ai_summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
          {lens?.id ? 'Update Lens' : 'Create Lens'}
        </Button>
      </div>
    </div>
  );
}
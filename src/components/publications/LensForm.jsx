import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Loader2, X, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { queryArticles } from '@/api/articles';
import { MicroLabel } from '@/components/brand/Brand';

const FIELD = 'rounded-xl border-white/10 bg-stone-800 text-stone-100';
const LABEL = 'mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500';

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
    const recentItems = await queryArticles({ enrichment_status: 'done', sort: '-published_date', limit: 5 });
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
    <div className="space-y-5">
      <div className="panel space-y-5 p-5 sm:p-6">
        <MicroLabel>Lens</MicroLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className={LABEL}>Lens name *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Defense Tech Investor" className={FIELD} />
          </div>
          <div>
            <Label className={LABEL}>Audience description</Label>
            <Input value={form.audience_description} onChange={e => setForm({ ...form, audience_description: e.target.value })}
              placeholder="Who is this lens scoring for?" className={FIELD} />
          </div>
        </div>

        <div>
          <Label className={LABEL}>Description</Label>
          <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Brief description of this lens" className={FIELD} />
        </div>

        <div>
          <Label className={LABEL}>Scoring prompt *</Label>
          <Textarea value={form.scoring_prompt} onChange={e => setForm({ ...form, scoring_prompt: e.target.value })}
            rows={12} className={`${FIELD} font-mono text-[13px] leading-relaxed`} />
          <p className="mt-1.5 text-xs text-stone-500">This prompt is sent to the LLM to score each story. Be specific about what matters.</p>
        </div>
      </div>

      <div className="panel space-y-5 p-5 sm:p-6">
        <MicroLabel>Filters</MicroLabel>
        <div>
          <Label className={LABEL}>Source categories</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {allCategories.map(cat => {
              const on = form.feed_filter_categories.includes(cat);
              return (
                <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                  className={on ? 'chip-brand cursor-pointer border border-[hsl(var(--brand)/0.3)] px-2 py-1' : 'chip-neutral cursor-pointer px-2 py-1 hover:text-stone-100'}>
                  {cat}
                </button>
              );
            })}
            {!allCategories.length && <p className="text-xs text-stone-500">No source categories found</p>}
          </div>
          <p className="mt-1.5 text-xs text-stone-500">Leave empty to score all sources. Selected categories limit which sources this lens applies to.</p>
        </div>

        <div>
          <Label className={LABEL}>Source tags</Label>
          {form.feed_filter_tags.length > 0 && (
            <div className="mb-2 mt-2 flex flex-wrap gap-2">
              {form.feed_filter_tags.map(tag => (
                <span key={tag} className="chip-brand gap-1 px-2 py-1">
                  {tag}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(tag)} />
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
              placeholder="Type or select a tag" className={`${FIELD} flex-1`}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput.trim()); }}}
              list="tag-suggestions" />
            <datalist id="tag-suggestions">
              {allTags.filter(t => !form.feed_filter_tags.includes(t)).map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
        </div>

        <div>
          <Label className={LABEL}>Minimum score threshold <span className="ml-1 text-stone-300">{form.minimum_score_threshold}</span></Label>
          <Slider value={[form.minimum_score_threshold]} onValueChange={v => setForm({ ...form, minimum_score_threshold: v[0] })}
            min={0} max={100} step={5} className="mt-2" />
          <p className="mt-1.5 text-xs text-stone-500">Stories scoring below this are not eligible as publication candidates.</p>
        </div>
      </div>

      {/* Test Section */}
      <div className="panel p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="flex items-center gap-2 font-display text-sm font-semibold text-stone-200">
            <FlaskConical className="h-4 w-4 text-[#C4A5FD]" /> Test lens
          </h4>
          <button type="button" className="btn-soft disabled:opacity-50" onClick={handleTest} disabled={testing || !form.scoring_prompt}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {testing ? 'Testing...' : 'Run test'}
          </button>
        </div>
        {testResults && (
          <div className="space-y-2">
            {testResults.map((r, i) => (
              <div key={i} className="panel-raised p-3 text-sm">
                <p className="truncate font-medium text-stone-200">{r.title}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="chip-neutral">{r.importance_score}</span>
                  <span className={`chip border ${r.intelligence_tag === 'Risk' ? 'border-red-400/25 bg-red-400/10 text-red-300' :
                    r.intelligence_tag === 'Opportunity' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' :
                    r.intelligence_tag === 'Trending' ? 'border-sky-400/25 bg-sky-400/10 text-sky-300' : 'border-white/10 text-stone-400'}`}>
                    {r.intelligence_tag}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-stone-400">{r.ai_summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost py-2" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving} className="btn-brand disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {lens?.id ? 'Update lens' : 'Create lens'}
        </button>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Download, CheckCircle2, AlertCircle, ExternalLink, ChevronDown, ChevronRight, Plus, Trash2, Upload, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import RssCrawler from '@/components/admin/RssCrawler';
import { PageHeader } from '@/components/brand/Brand';

const PRESET_SOURCES = [
  { label: 'Business & Economy', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Business%20%26%20Economy.opml', tags: ['business', 'economy'] },
  { label: 'Science', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Science.opml', tags: ['science'] },
  { label: 'Programming', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Programming.opml', tags: ['programming', 'dev'] },
  { label: 'Health & Fitness', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Health%20%26%20Fitness.opml', tags: ['health', 'fitness'] },
  { label: 'Gaming', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Gaming.opml', tags: ['gaming'] },
  { label: 'Space', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Space.opml', tags: ['space', 'science'] },
  { label: 'Movies', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Movies.opml', tags: ['movies', 'entertainment'] },
  { label: 'Design', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Design.opml', tags: ['design', 'ux'] },
  { label: 'Books', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Books.opml', tags: ['books', 'reading'] },
  { label: 'Sports', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Sports.opml', tags: ['sports'] },
  { label: 'Apple', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Apple.opml', tags: ['apple', 'tech'] },
  { label: 'Android', url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Android.opml', tags: ['android', 'tech'] },
];

function ResultRow({ result }) {
  const [expanded, setExpanded] = useState(false);
  const isError = !!result.error;
  return (
    <div className="panel-raised overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isError
            ? <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
          <span className="font-mono text-xs text-stone-300 truncate">{result.source.split('/').pop()}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!isError && (
            <>
              <Badge variant="secondary" className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-emerald-400/25 bg-emerald-400/10 text-emerald-300">{result.imported} imported</Badge>
              {result.skipped > 0 && <Badge variant="outline" className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-white/10 bg-white/[0.03] text-stone-400">{result.skipped} skipped</Badge>}
            </>
          )}
          {isError && <span className="font-mono text-xs text-red-300">{result.error}</span>}
          {result.feeds?.length > 0 && (expanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />)}
        </div>
      </button>
      {expanded && result.feeds?.length > 0 && (
        <div className="border-t border-white/[0.06] max-h-48 overflow-y-auto">
          {result.feeds.map((f, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 text-xs border-b border-white/[0.05] last:border-0">
              <span className="text-stone-300 font-medium truncate flex-1">{f.name}</span>
              <span className="chip-neutral ml-2 flex-shrink-0">{f.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminImportPage() {
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [customUrl, setCustomUrl] = useState('');
  const [customTags, setCustomTags] = useState('');
  const [results, setResults] = useState(null);
  const [selectedSources, setSelectedSources] = useState(new Set(PRESET_SOURCES.map(s => s.url)));
  
  // Manual entry states
  const [manualFeed, setManualFeed] = useState({ name: '', url: '', category: 'Other', tags: '' });
  const [manualDigest, setManualDigest] = useState({ name: '', description: '', categories: '', tags: '' });
  const [manualFeeds, setManualFeeds] = useState([]);
  const [manualDigests, setManualDigests] = useState([]);
  const feedsUploadRef = useRef(null);

  const toggleSource = (url) => {
    const next = new Set(selectedSources);
    next.has(url) ? next.delete(url) : next.add(url);
    setSelectedSources(next);
  };

  const addManualFeed = () => {
    if (!manualFeed.name.trim() || !manualFeed.url.trim()) {
      toast.error('Source name and URL are required');
      return;
    }
    const tags = manualFeed.tags.split(',').map(t => t.trim()).filter(Boolean);
    setManualFeeds([...manualFeeds, { ...manualFeed, tags }]);
    setManualFeed({ name: '', url: '', category: 'Other', tags: '' });
  };

  const removeManualFeed = (index) => {
    setManualFeeds(manualFeeds.filter((_, i) => i !== index));
  };

  const addManualDigest = () => {
    if (!manualDigest.name.trim()) {
      toast.error('Briefing name is required');
      return;
    }
    const categories = manualDigest.categories.split(',').map(c => c.trim()).filter(Boolean);
    const tags = manualDigest.tags.split(',').map(t => t.trim()).filter(Boolean);
    setManualDigests([...manualDigests, { ...manualDigest, categories, tags }]);
    setManualDigest({ name: '', description: '', categories: '', tags: '' });
  };

  const removeManualDigest = (index) => {
    setManualDigests(manualDigests.filter((_, i) => i !== index));
  };

  const submitManualItems = async () => {
    if (manualFeeds.length === 0 && manualDigests.length === 0) {
      toast.error('Add at least one source or briefing');
      return;
    }

    setLoading(true);
    try {
      if (manualFeeds.length > 0) {
        await Promise.all(manualFeeds.map(feed =>
          base44.entities.DirectoryFeed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category,
            tags: feed.tags,
            added_count: 0,
            upvotes: 0,
            downvotes: 0,
          })
        ));
      }

      if (manualDigests.length > 0) {
        await Promise.all(manualDigests.map(digest =>
          base44.entities.Digest.create({
            name: digest.name,
            description: digest.description,
            categories: digest.categories,
            tags: digest.tags,
            frequency: 'daily',
            is_public: true,
          })
        ));
      }

      toast.success(`Added ${manualFeeds.length} source(s) and ${manualDigests.length} briefing(s) to directory`);
      setManualFeeds([]);
      setManualDigests([]);
    } catch (e) {
      toast.error('Failed to add items: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const parseCsv = (csv) => {
    const lines = csv.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    // Simple CSV parser: split by comma and remove quotes
    const parseRow = (row) => {
      return row.split(',').map(val => val.trim().replace(/^"|"$/g, ''));
    };

    const header = parseRow(lines[0]).map(h => h.toLowerCase());

    return lines.slice(1).map(line => {
      const values = parseRow(line);
      return Object.fromEntries(header.map((h, i) => [h, values[i] || '']));
    });
  };

  const [pendingCsvFile, setPendingCsvFile] = useState(null);
  const [pendingCsvFeeds, setPendingCsvFeeds] = useState([]);

  const handleBulkFeedsUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      toast.error('No file selected');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target.result;
        if (!csv) throw new Error('Failed to read file');
        const rows = parseCsv(csv);
        const feeds = rows.map(r => ({
          name: r.name || r.feed_name || '',
          url: r.url || r.feed_url || '',
          category: r.category || 'Other',
          tags: (r.tags || '').split(';').map(t => t.trim()).filter(Boolean),
        }));
        const validFeeds = feeds.filter(f => f.name && f.url);
        if (validFeeds.length === 0) {
          toast.error('No valid sources found in CSV. Check that name and url columns are present and populated.');
          return;
        }
        setPendingCsvFile(file.name);
        setPendingCsvFeeds(validFeeds);
        e.target.value = '';
      } catch (err) {
        toast.error('Failed to parse CSV: ' + err.message);
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read file');
    };
    reader.readAsText(file);
  };

  const confirmCsvUpload = async () => {
    // Deduplicate against existing directory feeds
    const existing = await base44.entities.DirectoryFeed.list('-created_date', 500);
    const existingUrls = new Set(existing.map(f => f.url?.trim().toLowerCase()));

    // Also deduplicate against feeds already staged in manualFeeds
    const stagedUrls = new Set(manualFeeds.map(f => f.url?.trim().toLowerCase()));

    const newFeeds = pendingCsvFeeds.filter(f => {
      const normalized = f.url?.trim().toLowerCase();
      return normalized && !existingUrls.has(normalized) && !stagedUrls.has(normalized);
    });
    const dupeCount = pendingCsvFeeds.length - newFeeds.length;

    setManualFeeds([...manualFeeds, ...newFeeds]);
    setPendingCsvFile(null);
    setPendingCsvFeeds([]);

    if (dupeCount > 0) {
      toast.success(`Added ${newFeeds.length} source(s) from CSV. ${dupeCount} duplicate(s) skipped`);
    } else {
      toast.success(`Added ${newFeeds.length} source(s) from CSV`);
    }
  };

  const cancelCsvUpload = () => {
    setPendingCsvFile(null);
    setPendingCsvFeeds([]);
  };

  const handleBulkDigestsUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target.result;
        if (!csv) throw new Error('Failed to read file');
        const rows = parseCsv(csv);
        const digests = rows.map(r => ({
          name: r.name || r.digest_name || '',
          description: r.description || r.desc || '',
          categories: (r.categories || '').split(';').map(c => c.trim()).filter(Boolean),
          tags: (r.tags || '').split(';').map(t => t.trim()).filter(Boolean),
        })).filter(d => d.name);
        if (digests.length === 0) {
          toast.error('No valid briefings found in CSV');
          return;
        }
        setManualDigests([...manualDigests, ...digests]);
        toast.success(`Added ${digests.length} briefing(s) from CSV`);
        e.target.value = '';
      } catch (err) {
        toast.error('Failed to parse CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const runImport = async (specificUrl = null) => {
    setLoading(true);
    setResults(null);
    try {
      const payload = { dry_run: dryRun };
      if (specificUrl) {
        payload.source_url = specificUrl;
        payload.tags = customTags.split(',').map(t => t.trim()).filter(Boolean);
      }
      // If not specific, pass selected preset sources via multiple calls
      if (!specificUrl) {
        const allResults = [];
        for (const source of PRESET_SOURCES.filter(s => selectedSources.has(s.url))) {
          const res = await base44.functions.invoke('importOpmlFeeds', {
            source_url: source.url,
            tags: source.tags,
            dry_run: dryRun,
          });
          if (res.data?.results) allResults.push(...res.data.results);
        }
        setResults({
          total_imported: allResults.reduce((s, r) => s + (r.imported || 0), 0),
          total_skipped: allResults.reduce((s, r) => s + (r.skipped || 0), 0),
          results: allResults,
        });
      } else {
        const res = await base44.functions.invoke('importOpmlFeeds', payload);
        setResults(res.data);
      }
      toast.success(dryRun ? 'Dry run complete — check results below' : 'Import complete!');
    } catch (e) {
      toast.error('Import failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Import sources"
        subtitle={
          <>
            Populate the public directory from curated RSS indexes.
            Index: <a href="https://github.com/plenaryapp/awesome-rss-feeds" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-sm text-[#C4A5FD] hover:underline">awesome-rss-feeds <ExternalLink className="w-3 h-3" /></a> (CC0 license)
          </>
        }
      />

      <div className="space-y-6">
        {/* AI RSS Discovery */}
        <RssCrawler />

        {/* Bulk Feed Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold text-stone-100">Bulk add sources to directory</CardTitle>
            <CardDescription className="text-xs text-stone-500">Upload a CSV file with columns: name, url, category (optional), tags (optional, semicolon-separated)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {pendingCsvFile ? (
              <div className="relative rounded-xl border border-[hsl(var(--brand)/0.35)] bg-[hsl(var(--brand)/0.08)] px-4 py-5 flex flex-col items-center gap-3">
                <button
                  onClick={cancelCsvUpload}
                  className="absolute top-2 right-2 rounded-md p-1 text-stone-500 hover:text-red-300 transition"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 text-[#D9C7FE]">
                  <Upload className="w-4 h-4" />
                  <span className="font-mono text-sm font-medium truncate max-w-[240px]">{pendingCsvFile}</span>
                </div>
                <p className="font-mono text-[11px] text-stone-400">{pendingCsvFeeds.length} valid source(s) found</p>
                <button type="button" onClick={confirmCsvUpload} className="btn-soft w-full py-2">
                  Confirm upload
                </button>
              </div>
            ) : (
              <label htmlFor="bulk-feeds-upload" className="flex flex-col items-center justify-center w-full px-4 py-6 border-2 border-dashed border-white/10 rounded-xl hover:border-[hsl(var(--brand)/0.4)] hover:bg-[hsl(var(--brand)/0.06)] cursor-pointer transition">
                <Upload className="w-5 h-5 text-stone-500 mb-2" />
                <span className="text-sm text-stone-400">Click to upload CSV or drag and drop</span>
                <input
                  ref={feedsUploadRef}
                  id="bulk-feeds-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleBulkFeedsUpload}
                  className="hidden"
                />
              </label>
            )}
            <p className="font-mono text-[10px] text-stone-500 mt-2">Example: Source1,https://example.com/feed.xml,Tech,ai;startup</p>
          </CardContent>
        </Card>

        {/* Bulk Digest Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold text-stone-100">Bulk add briefings to directory</CardTitle>
            <CardDescription className="text-xs text-stone-500">Upload a CSV file with columns: name, description (optional), categories (optional, semicolon-separated), tags (optional, semicolon-separated)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <label htmlFor="bulk-digests-upload" className="flex flex-col items-center justify-center w-full px-4 py-6 border-2 border-dashed border-white/10 rounded-xl hover:border-[hsl(var(--brand)/0.4)] hover:bg-[hsl(var(--brand)/0.06)] cursor-pointer transition">
              <Upload className="w-5 h-5 text-stone-500 mb-2" />
              <span className="text-sm text-stone-400">Click to upload CSV or drag and drop</span>
              <input
                id="bulk-digests-upload"
                type="file"
                accept=".csv"
                onChange={handleBulkDigestsUpload}
                className="hidden"
              />
            </label>
            <p className="font-mono text-[10px] text-stone-500 mt-2">Example: DailyNews,News briefing,Tech;AI,daily;news</p>
          </CardContent>
        </Card>

        {/* Manual Feed Entry */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold text-stone-100">Add a source to the directory</CardTitle>
            <CardDescription className="text-xs text-stone-500">Manually add a single RSS source to the public directory</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Source name</Label>
                <Input
                  placeholder="e.g. TechCrunch"
                  value={manualFeed.name}
                  onChange={(e) => setManualFeed({ ...manualFeed, name: e.target.value })}
                  className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
                />
              </div>
              <div>
                <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">RSS feed URL</Label>
                <Input
                  placeholder="https://example.com/feed.xml"
                  value={manualFeed.url}
                  onChange={(e) => setManualFeed({ ...manualFeed, url: e.target.value })}
                  className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Category</Label>
                <Select value={manualFeed.category} onValueChange={(cat) => setManualFeed({ ...manualFeed, category: cat })}>
                  <SelectTrigger className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRE">CRE</SelectItem>
                    <SelectItem value="Markets">Markets</SelectItem>
                    <SelectItem value="Tech">Tech</SelectItem>
                    <SelectItem value="News">News</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Crypto">Crypto</SelectItem>
                    <SelectItem value="AI">AI</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Tags (comma-separated)</Label>
                <Input
                  placeholder="e.g. tech, startup"
                  value={manualFeed.tags}
                  onChange={(e) => setManualFeed({ ...manualFeed, tags: e.target.value })}
                  className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={addManualFeed}
              disabled={!manualFeed.name.trim() || !manualFeed.url.trim()}
              className="btn-ghost w-full py-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add source
            </button>

            {manualFeeds.length > 0 && (
              <div className="border-t border-white/[0.06] pt-3 space-y-2">
                <p className="micro-label"><span className="text-stone-300">{manualFeeds.length}</span> source(s) to add</p>
                {manualFeeds.map((f, i) => (
                  <div key={i} className="panel-raised flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-stone-200">{f.name}</p>
                      <p className="font-mono text-[10px] text-stone-500 truncate">{f.url}</p>
                    </div>
                    <button
                      onClick={() => removeManualFeed(i)}
                      className="ml-2 rounded-md p-1 text-stone-500 hover:text-red-300 transition flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Digest Entry */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold text-stone-100">Add a briefing to the directory</CardTitle>
            <CardDescription className="text-xs text-stone-500">Manually add a single briefing to the public directory</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Briefing name</Label>
                <Input
                  placeholder="e.g. Daily Tech News"
                  value={manualDigest.name}
                  onChange={(e) => setManualDigest({ ...manualDigest, name: e.target.value })}
                  className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
                />
              </div>
              <div>
                <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Description</Label>
                <Input
                  placeholder="Brief description"
                  value={manualDigest.description}
                  onChange={(e) => setManualDigest({ ...manualDigest, description: e.target.value })}
                  className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Categories (comma-separated)</Label>
                <Input
                  placeholder="e.g. Tech, AI"
                  value={manualDigest.categories}
                  onChange={(e) => setManualDigest({ ...manualDigest, categories: e.target.value })}
                  className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
                />
              </div>
              <div>
                <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Tags (comma-separated)</Label>
                <Input
                  placeholder="e.g. news, daily"
                  value={manualDigest.tags}
                  onChange={(e) => setManualDigest({ ...manualDigest, tags: e.target.value })}
                  className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={addManualDigest}
              disabled={!manualDigest.name.trim()}
              className="btn-ghost w-full py-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add briefing
            </button>

            {manualDigests.length > 0 && (
              <div className="border-t border-white/[0.06] pt-3 space-y-2">
                <p className="micro-label"><span className="text-stone-300">{manualDigests.length}</span> briefing(s) to add</p>
                {manualDigests.map((d, i) => (
                  <div key={i} className="panel-raised flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-stone-200">{d.name}</p>
                      {d.description && <p className="text-[10px] text-stone-500">{d.description}</p>}
                    </div>
                    <button
                      onClick={() => removeManualDigest(i)}
                      className="ml-2 rounded-md p-1 text-stone-500 hover:text-red-300 transition flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit all manual items */}
        {(manualFeeds.length > 0 || manualDigests.length > 0) && (
          <Card className="border-[hsl(var(--brand)/0.35)] bg-[hsl(var(--brand)/0.08)]">
            <CardContent className="p-4">
              <button
                type="button"
                onClick={submitManualItems}
                disabled={loading}
                className="btn-brand w-full disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add {manualFeeds.length + manualDigests.length} entr{manualFeeds.length + manualDigests.length === 1 ? 'y' : 'ies'} to directory
              </button>
            </CardContent>
          </Card>
        )}
      
        {/* Dry run toggle */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display font-semibold text-stone-100 text-sm">Dry run mode</p>
                  <p className="text-xs text-stone-500 mt-0.5">Preview what would be imported without saving anything</p>
              </div>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>
            {!dryRun && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                This will write sources to the database and make them public in the directory.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preset sources */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold text-stone-100">Preset OPML indexes</CardTitle>
            <CardDescription className="text-xs text-stone-500">Select categories to import from the awesome-rss-feeds index</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {PRESET_SOURCES.map(source => (
                <button
                  key={source.url}
                  onClick={() => toggleSource(source.url)}
                  className={`text-left px-3 py-2 rounded-xl border text-sm transition ${
                    selectedSources.has(source.url)
                      ? 'border-[hsl(var(--brand)/0.4)] bg-[hsl(var(--brand)/0.14)] text-[#D9C7FE]'
                      : 'border-white/10 text-stone-400 hover:border-white/20 hover:text-stone-200'
                  }`}
                >
                  <div className="font-medium text-xs">{source.label}</div>
                  <div className="font-mono text-[10px] mt-0.5 opacity-70">{source.tags.join(', ')}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => runImport()}
              disabled={loading || selectedSources.size === 0}
              className="btn-brand w-full disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {dryRun ? 'Preview import' : `Import ${selectedSources.size} index${selectedSources.size !== 1 ? 'es' : ''}`}
            </button>
          </CardContent>
        </Card>

        {/* Custom OPML URL */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold text-stone-100">Custom OPML URL</CardTitle>
            <CardDescription className="text-xs text-stone-500">Import from any publicly accessible OPML file</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div>
              <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">OPML URL</Label>
              <Input
                placeholder="https://example.com/feeds.opml"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
              />
            </div>
            <div>
              <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Tags (comma-separated)</Label>
              <Input
                placeholder="e.g. finance, investing, stocks"
                value={customTags}
                onChange={(e) => setCustomTags(e.target.value)}
                className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
              />
            </div>
            <button
              type="button"
              onClick={() => runImport(customUrl)}
              disabled={loading || !customUrl.trim()}
              className="btn-soft w-full py-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {dryRun ? 'Preview custom import' : 'Import custom OPML'}
            </button>
          </CardContent>
        </Card>

        {/* Results */}
        {results && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-base font-semibold text-stone-100">
                Results
                <Badge className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-emerald-400/25 bg-emerald-400/10 text-emerald-300">{results.total_imported} sources</Badge>
                {results.total_skipped > 0 && (
                  <Badge variant="outline" className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-white/10 bg-white/[0.03] text-stone-400">{results.total_skipped} skipped (duplicates)</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {results.results?.map((r, i) => <ResultRow key={i} result={r} />)}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}


// --- Admin-only guard (non-admins see an "Admins only" message; inner page never mounts) ---
function AdminOnlyGuard({ children }) {
  const [access, setAccess] = React.useState('loading');
  React.useEffect(() => {
    let cancelled = false;
    base44.auth.me()
      .then((u) => { if (!cancelled) setAccess(u?.role === 'admin' ? 'admin' : 'denied'); })
      .catch(() => { if (!cancelled) setAccess('denied'); });
    return () => { cancelled = true; };
  }, []);
  if (access === 'loading') {
    return <div className="p-6 lg:p-8 max-w-3xl mx-auto text-sm text-stone-500">Loading...</div>;
  }
  if (access !== 'admin') {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="panel p-8 text-center">
          <h2 className="font-display text-lg font-semibold text-stone-200 mb-1">Admins only</h2>
          <p className="text-sm text-stone-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function AdminImport() {
  return (
    <AdminOnlyGuard>
      <AdminImportPage />
    </AdminOnlyGuard>
  );
}

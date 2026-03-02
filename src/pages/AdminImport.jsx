import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Download, CheckCircle2, AlertCircle, ExternalLink, ChevronDown, ChevronRight, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import RssCrawler from '@/components/admin/RssCrawler';

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
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isError
            ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
          <span className="text-sm text-slate-700 truncate">{result.source.split('/').pop()}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!isError && (
            <>
              <Badge variant="secondary" className="text-xs">{result.imported} imported</Badge>
              {result.skipped > 0 && <Badge variant="outline" className="text-xs">{result.skipped} skipped</Badge>}
            </>
          )}
          {isError && <span className="text-xs text-red-500">{result.error}</span>}
          {result.feeds?.length > 0 && (expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />)}
        </div>
      </button>
      {expanded && result.feeds?.length > 0 && (
        <div className="border-t border-slate-100 max-h-48 overflow-y-auto">
          {result.feeds.map((f, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 text-xs border-b border-slate-50 last:border-0">
              <span className="text-slate-700 font-medium truncate flex-1">{f.name}</span>
              <Badge variant="secondary" className="text-[10px] ml-2 flex-shrink-0">{f.category}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminImport() {
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
      toast.error('Feed name and URL are required');
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
      toast.error('Digest name is required');
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
      toast.error('Add at least one feed or digest');
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

      toast.success(`Added ${manualFeeds.length} feed(s) and ${manualDigests.length} digest(s) to directory`);
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
          toast.error('No valid feeds found in CSV. Check that name and url columns are present and populated.');
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

  const confirmCsvUpload = () => {
    setManualFeeds([...manualFeeds, ...pendingCsvFeeds]);
    toast.success(`Added ${pendingCsvFeeds.length} feed(s) from CSV`);
    setPendingCsvFile(null);
    setPendingCsvFeeds([]);
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
          toast.error('No valid digests found in CSV');
          return;
        }
        setManualDigests([...manualDigests, ...digests]);
        toast.success(`Added ${digests.length} digest(es) from CSV`);
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Import Feeds from OPML</h1>
        <p className="text-slate-500 text-sm mt-1">
          Populate the public directory from curated RSS indexes.
          Source: <a href="https://github.com/plenaryapp/awesome-rss-feeds" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1">awesome-rss-feeds <ExternalLink className="w-3 h-3" /></a> (CC0 license)
        </p>
      </div>

      <div className="space-y-6">
        {/* AI RSS Discovery */}
        <RssCrawler />

        {/* Bulk Feed Upload */}
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bulk Add Feeds to Directory</CardTitle>
            <CardDescription className="text-xs">Upload a CSV file with columns: name, url, category (optional), tags (optional, semicolon-separated)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <label htmlFor="bulk-feeds-upload" className="flex flex-col items-center justify-center w-full px-4 py-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer transition">
              <Upload className="w-5 h-5 text-slate-400 mb-2" />
              <span className="text-sm text-slate-600">Click to upload CSV or drag and drop</span>
              <input
                ref={feedsUploadRef}
                id="bulk-feeds-upload"
                type="file"
                accept=".csv"
                onChange={handleBulkFeedsUpload}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-slate-500 mt-2">Example: Feed1,https://example.com/feed.xml,Tech,ai;startup</p>
          </CardContent>
        </Card>

        {/* Bulk Digest Upload */}
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bulk Add Digests to Directory</CardTitle>
            <CardDescription className="text-xs">Upload a CSV file with columns: name, description (optional), categories (optional, semicolon-separated), tags (optional, semicolon-separated)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <label htmlFor="bulk-digests-upload" className="flex flex-col items-center justify-center w-full px-4 py-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer transition">
              <Upload className="w-5 h-5 text-slate-400 mb-2" />
              <span className="text-sm text-slate-600">Click to upload CSV or drag and drop</span>
              <input
                id="bulk-digests-upload"
                type="file"
                accept=".csv"
                onChange={handleBulkDigestsUpload}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-slate-500 mt-2">Example: DailyNews,News digest,Tech;AI,daily;news</p>
          </CardContent>
        </Card>

        {/* Manual Feed Entry */}
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add Feed to Directory</CardTitle>
            <CardDescription className="text-xs">Manually add a single RSS feed to the public directory</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Feed Name</Label>
                <Input
                  placeholder="e.g. TechCrunch"
                  value={manualFeed.name}
                  onChange={(e) => setManualFeed({ ...manualFeed, name: e.target.value })}
                  className="mt-1 text-sm rounded-lg"
                />
              </div>
              <div>
                <Label className="text-xs">Feed URL</Label>
                <Input
                  placeholder="https://example.com/feed.xml"
                  value={manualFeed.url}
                  onChange={(e) => setManualFeed({ ...manualFeed, url: e.target.value })}
                  className="mt-1 text-sm rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={manualFeed.category} onValueChange={(cat) => setManualFeed({ ...manualFeed, category: cat })}>
                  <SelectTrigger className="mt-1 text-sm rounded-lg h-9">
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
                <Label className="text-xs">Tags (comma-separated)</Label>
                <Input
                  placeholder="e.g. tech, startup"
                  value={manualFeed.tags}
                  onChange={(e) => setManualFeed({ ...manualFeed, tags: e.target.value })}
                  className="mt-1 text-sm rounded-lg"
                />
              </div>
            </div>
            <Button
              onClick={addManualFeed}
              disabled={!manualFeed.name.trim() || !manualFeed.url.trim()}
              variant="outline"
              className="rounded-lg w-full text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Feed
            </Button>

            {manualFeeds.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-slate-700">{manualFeeds.length} feed(s) to add:</p>
                {manualFeeds.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900">{f.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{f.url}</p>
                    </div>
                    <button
                      onClick={() => removeManualFeed(i)}
                      className="ml-2 p-1 text-slate-400 hover:text-red-600 transition flex-shrink-0"
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
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add Digest to Directory</CardTitle>
            <CardDescription className="text-xs">Manually add a single digest to the public directory</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Digest Name</Label>
                <Input
                  placeholder="e.g. Daily Tech News"
                  value={manualDigest.name}
                  onChange={(e) => setManualDigest({ ...manualDigest, name: e.target.value })}
                  className="mt-1 text-sm rounded-lg"
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  placeholder="Brief description"
                  value={manualDigest.description}
                  onChange={(e) => setManualDigest({ ...manualDigest, description: e.target.value })}
                  className="mt-1 text-sm rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Categories (comma-separated)</Label>
                <Input
                  placeholder="e.g. Tech, AI"
                  value={manualDigest.categories}
                  onChange={(e) => setManualDigest({ ...manualDigest, categories: e.target.value })}
                  className="mt-1 text-sm rounded-lg"
                />
              </div>
              <div>
                <Label className="text-xs">Tags (comma-separated)</Label>
                <Input
                  placeholder="e.g. news, daily"
                  value={manualDigest.tags}
                  onChange={(e) => setManualDigest({ ...manualDigest, tags: e.target.value })}
                  className="mt-1 text-sm rounded-lg"
                />
              </div>
            </div>
            <Button
              onClick={addManualDigest}
              disabled={!manualDigest.name.trim()}
              variant="outline"
              className="rounded-lg w-full text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Digest
            </Button>

            {manualDigests.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-slate-700">{manualDigests.length} digest(es) to add:</p>
                {manualDigests.map((d, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900">{d.name}</p>
                      {d.description && <p className="text-[10px] text-slate-500">{d.description}</p>}
                    </div>
                    <button
                      onClick={() => removeManualDigest(i)}
                      className="ml-2 p-1 text-slate-400 hover:text-red-600 transition flex-shrink-0"
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
          <Card className="border-indigo-200 bg-indigo-50">
            <CardContent className="p-4">
              <Button
                onClick={submitManualItems}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-lg w-full"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add {manualFeeds.length + manualDigests.length} Item(s) to Directory
              </Button>
            </CardContent>
          </Card>
        )}
      
        {/* Dry run toggle */}
        <Card className="border-slate-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900 text-sm">Dry Run Mode</p>
                <p className="text-xs text-slate-500 mt-0.5">Preview what would be imported without saving anything</p>
              </div>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>
            {!dryRun && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                ⚠️ This will write feeds to the database and make them public in the directory.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preset sources */}
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preset OPML Sources</CardTitle>
            <CardDescription className="text-xs">Select categories to import from the awesome-rss-feeds index</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {PRESET_SOURCES.map(source => (
                <button
                  key={source.url}
                  onClick={() => toggleSource(source.url)}
                  className={`text-left px-3 py-2 rounded-lg border text-sm transition ${
                    selectedSources.has(source.url)
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium text-xs">{source.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{source.tags.join(', ')}</div>
                </button>
              ))}
            </div>
            <Button
              onClick={() => runImport()}
              disabled={loading || selectedSources.size === 0}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-lg w-full"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {dryRun ? 'Preview Import' : `Import ${selectedSources.size} Source${selectedSources.size !== 1 ? 's' : ''}`}
            </Button>
          </CardContent>
        </Card>

        {/* Custom OPML URL */}
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Custom OPML URL</CardTitle>
            <CardDescription className="text-xs">Import from any publicly accessible OPML file</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div>
              <Label className="text-xs">OPML URL</Label>
              <Input
                placeholder="https://example.com/feeds.opml"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="mt-1 text-sm rounded-lg"
              />
            </div>
            <div>
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input
                placeholder="e.g. finance, investing, stocks"
                value={customTags}
                onChange={(e) => setCustomTags(e.target.value)}
                className="mt-1 text-sm rounded-lg"
              />
            </div>
            <Button
              onClick={() => runImport(customUrl)}
              disabled={loading || !customUrl.trim()}
              variant="outline"
              className="rounded-lg w-full"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {dryRun ? 'Preview Custom Import' : 'Import Custom OPML'}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {results && (
          <Card className="border-slate-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Results
                <Badge className="bg-green-100 text-green-700 border-0 text-xs">{results.total_imported} feeds</Badge>
                {results.total_skipped > 0 && (
                  <Badge variant="outline" className="text-xs">{results.total_skipped} skipped (duplicates)</Badge>
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
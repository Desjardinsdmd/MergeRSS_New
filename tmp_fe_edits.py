import re, sys

IMPORT = "import { queryArticles, queryArticlesWithClusters, summarizeArticle } from '@/api/articles';\n"
edits = {
 'src/pages/ArticleSearch.jsx': [
  ("""      const filters = {};
      if (selectedCategory) filters.category = selectedCategory;
      if (author.trim()) filters.author = { $regex: author.trim(), $options: 'i' };
      if (dateFrom || dateTo) {
        filters.published_date = {};
        if (dateFrom) filters.published_date.$gte = new Date(dateFrom).toISOString();
        if (dateTo) {
          const toEnd = new Date(dateTo);
          toEnd.setHours(23, 59, 59, 999);
          filters.published_date.$lte = toEnd.toISOString();
        }
      }
      if (user?.email) filters.created_by = user.email;
      return base44.entities.FeedItem.filter(filters, '-published_date', 500);""",
   """      // Server-side scoped to the user's own feeds. (The old filter on created_by matched
      // nothing for regular users, because articles are written by the fetch job.)
      const params = { sort: '-published_date', limit: 500 };
      if (selectedCategory) params.category = selectedCategory;
      if (author.trim()) params.author = author.trim();
      if (dateFrom) params.since = new Date(dateFrom).toISOString();
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        params.until = toEnd.toISOString();
      }
      return queryArticles(params);"""),
 ],
 'src/components/publications/LensForm.jsx': [
  ("""    const recentItems = await base44.entities.FeedItem.filter(
      { enrichment_status: 'done' }, '-published_date', 5
    );""",
   """    const recentItems = await queryArticles({ enrichment_status: 'done', sort: '-published_date', limit: 5 });"""),
 ],
 'src/components/dashboard/SignalRadarChart.jsx': [
  ("""    queryFn: () => base44.entities.FeedItem.filter(
      { feed_id: { $in: feedIds }, published_date: { $gte: since28d }, importance_score: { $gte: 80 } },
      '-published_date', 500
    ),""",
   """    queryFn: () => queryArticles({ feed_ids: feedIds, since: since28d, min_score: 80, sort: '-published_date', limit: 500 }),"""),
 ],
 'src/components/feeds/ArticleSummarizeButton.jsx': [
  ("""      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Summarize the following article in 2-3 concise sentences. Focus on the key points and takeaways.\\n\\nTitle: ${item.title}\\n\\n${item.description || item.content || 'No content available.'}`,
      });
      const summary = typeof result === 'string' ? result : result?.summary || result?.text || String(result);
      await base44.entities.FeedItem.update(item.id, { ai_summary: summary });""",
   """      // Backend checks the user owns this article's feed before writing the summary.
      const summary = await summarizeArticle(item.id);"""),
 ],
 'src/components/feeds/EmergingSignals.jsx': [
  ("""            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since24h } },
                '-importance_score',
                100
            );""",
   """            const raw = await queryArticles({ feed_ids: feedIds, since: since24h, sort: '-importance_score', limit: 100 });"""),
 ],
 'src/components/feeds/WhatChanged.jsx': [
  ("""            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since } },
                '-importance_score',
                80
            );""",
   """            const raw = await queryArticles({ feed_ids: feedIds, since, sort: '-importance_score', limit: 80 });"""),
 ],
 'src/components/feeds/TopFiveToday.jsx': [
  ("""            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since48h } },
                '-importance_score',
                200
            );""",
   """            const raw = await queryArticles({ feed_ids: feedIds, since: since48h, sort: '-importance_score', limit: 200 });"""),
 ],
 'src/components/feeds/FeedListView.jsx': [
  ("""    const items = await base44.entities.FeedItem.filter({ feed_id: feed.id }, '-published_date', 20);""",
   """    const items = await queryArticles({ feed_ids: [feed.id], sort: '-published_date', limit: 20 });"""),
 ],
 'src/components/feeds/FeedCard.jsx': [
  ("""    const items = await base44.entities.FeedItem.filter({ feed_id: feed.id }, '-published_date', 20);""",
   """    const items = await queryArticles({ feed_ids: [feed.id], sort: '-published_date', limit: 20 });"""),
 ],
 'src/components/feeds/IntelligenceDashboard.jsx': [
  ("""            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since48h } },
                '-importance_score',
                100
            );
            return Array.isArray(raw) ? raw : (raw?.items || raw?.data || []);""",
   """            return queryArticles({ feed_ids: feedIds, since: since48h, sort: '-importance_score', limit: 100 });"""),
  ("""        queryKey: ['story-clusters-active'],
        queryFn: async () => {
            const raw = await base44.entities.StoryCluster.filter(
                { status: 'active' }, '-trend_score', 300
            );
            return Array.isArray(raw) ? raw : (raw?.items || raw?.data || []);
        },""",
   """        // Only clusters the user's own articles belong to (was: every active cluster system-wide).
        queryKey: ['story-clusters-mine', feedIds.join(',')],
        queryFn: async () => {
            const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            const { clusters } = await queryArticlesWithClusters({ feed_ids: feedIds, since: since48h, sort: '-importance_score', limit: 100 });
            return clusters;
        },
        enabled: !!feedIds.length,"""),
 ],
}

ok = True
for path, reps in edits.items():
    s = open(path).read()
    for old, new in reps:
        n = s.count(old)
        if n != 1:
            print(f'FAIL {path}: match count {n} for: {old[:70]!r}'); ok = False; continue
        s = s.replace(old, new)
    if "from '@/api/articles'" not in s:
        lines = s.split('\n')
        last = max(i for i, l in enumerate(lines) if l.startswith('import '))
        # handle multi-line import ending
        j = last
        while not lines[j].rstrip().endswith(';'):
            j += 1
        lines.insert(j + 1, IMPORT.rstrip('\n'))
        s = '\n'.join(lines)
    open(path, 'w').write(s)
    print('edited', path)
sys.exit(0 if ok else 1)

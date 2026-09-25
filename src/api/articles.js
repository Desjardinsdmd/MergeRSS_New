import { base44 } from '@/api/base44Client';

// All article and story-cluster reads go through the queryArticles backend function,
// which only returns data from the signed-in user's own feeds. Never read FeedItem or
// StoryCluster entities directly from the frontend.

export async function queryArticles(params = {}) {
  const res = await base44.functions.invoke('queryArticles', params);
  return res?.data?.items || [];
}

export async function queryArticlesWithClusters(params = {}) {
  const res = await base44.functions.invoke('queryArticles', { ...params, include_clusters: true });
  return { items: res?.data?.items || [], clusters: res?.data?.clusters || [] };
}

export async function summarizeArticle(itemId) {
  const res = await base44.functions.invoke('summarizeArticle', { item_id: itemId });
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data?.summary || '';
}

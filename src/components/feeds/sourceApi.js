import { base44 } from '@/api/base44Client';

// Pull a readable message out of a functions.invoke failure (non-2xx responses throw).
export function invokeErrorMessage(err, fallback = 'Something went wrong') {
  return err?.response?.data?.error || err?.data?.error || err?.message || fallback;
}

/**
 * Create a source through the addSource backend so URL discovery, plan limits, dedupe
 * and the first fetch all apply. Never throws.
 * Returns { ok, duplicate, limitReached, feedId, data, error }.
 */
export async function addSourceViaApi(payload) {
  try {
    const res = await base44.functions.invoke('addSource', payload);
    const data = res?.data || {};
    if (!data.success) {
      return { ok: false, error: data.error || 'Failed to add source', data, limitReached: !!data.limit_reached };
    }
    return { ok: true, duplicate: !!data.duplicate, feedId: data.source_id, data };
  } catch (err) {
    const data = err?.response?.data || {};
    return {
      ok: false,
      error: invokeErrorMessage(err, 'Failed to add source'),
      data,
      limitReached: !!data.limit_reached,
    };
  }
}

/**
 * Create or update a digest through saveDigest (plan limit, premium channels, feed ownership,
 * timezone default). Never throws. Returns { ok, digest, warnings, error, limitReached }.
 */
export async function saveDigestViaApi(payload) {
  try {
    const res = await base44.functions.invoke('saveDigest', payload);
    const data = res?.data || {};
    if (!data.success) return { ok: false, error: data.error || 'Failed to save digest', limitReached: !!data.limit_reached, warnings: [] };
    return { ok: true, digest: data.digest, created: !!data.created, warnings: data.warnings || [] };
  } catch (err) {
    const data = err?.response?.data || {};
    return { ok: false, error: invokeErrorMessage(err, 'Failed to save digest'), limitReached: !!data.limit_reached, warnings: [] };
  }
}

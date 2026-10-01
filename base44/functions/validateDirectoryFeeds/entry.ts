import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';


// ── SSRF guard (2026-09-25) ────────────────────────────────────────────────────
// Every outbound fetch of a user-supplied URL goes through safeFetch: http(s) only, no
// localhost / private / link-local / metadata hosts, DNS answers checked when the runtime
// allows it, and redirects followed manually so each hop is re-validated (a public URL that
// 302s to 169.254.169.254 used to sail through).
const __BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data', '0.0.0.0']);
function __isPrivateIp(ip) {
    const h = String(ip).replace(/^\[|\]$/g, '').toLowerCase().replace(/%.*$/, '');
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true; // CGNAT
    if (/^198\.1[89]\./.test(h)) return true; // benchmarking 198.18.0.0/15
    const __q = h.match(/^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    if (__q && Number(__q[1]) >= 224) return true; // multicast / reserved 224.0.0.0+
    if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    if (/^::[0-9a-f]{1,4}$/.test(h)) return true; // ::x  == 0.0.x.x
    if (/^64:ff9b:1:/.test(h)) return true; // local-use NAT64 64:ff9b:1::/48
    // IPv4 embedded in IPv6: ::ffff:a.b.c.d, ::ffff:XXXX:YYYY, ::ffff:0:..., NAT64 64:ff9b::/96,
    // IPv4-compatible ::a.b.c.d / ::XXXX:YYYY (plus expanded zero forms). Extract and re-check.
    const __m = h.match(/^(?:::ffff:(?:0{1,4}:)?|64:ff9b::|64:ff9b:(?:0{1,4}:){4}|(?:0{1,4}:){5}ffff:|(?:0{1,4}:){4}ffff:0{1,4}:|(?:0{1,4}:){6}|::)((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{1,4}:[0-9a-f]{1,4})$/);
    if (__m) {
        let v4 = __m[1];
        if (v4.includes(':')) {
            const [a, b] = v4.split(':').map(x => parseInt(x, 16));
            v4 = [a >> 8, a & 255, b >> 8, b & 255].join('.');
        }
        return __isPrivateIp(v4);
    }
    return false;
}
async function __assertPublicUrl(raw) {
    let u;
    try { u = new URL(raw); } catch { throw new Error('SSRF_BLOCKED: invalid URL'); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('SSRF_BLOCKED: scheme');
    const host = u.hostname.toLowerCase();
    if (__BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal') || __isPrivateIp(host)) {
        throw new Error('SSRF_BLOCKED: private host');
    }
    if (!/^[\d.]+$/.test(host) && !host.includes(':')) {
        for (const type of ['A', 'AAAA']) {
            let answers = [];
            try { answers = await Deno.resolveDns(host, type); } catch { answers = []; }
            if (answers.some(__isPrivateIp)) throw new Error('SSRF_BLOCKED: resolves to private address');
        }
    }
    return u;
}
async function safeFetch(url, init = {}) {
    let current = String(url);
    for (let hop = 0; hop <= 5; hop++) {
        await __assertPublicUrl(current);
        const res = await fetch(current, { ...init, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            current = new URL(res.headers.get('location'), current).toString();
            continue;
        }
        return res;
    }
    throw new Error('SSRF_BLOCKED: too many redirects');
}
// ───────────────────────────────────────────────────────────────────────────────

const validateFeedUrl = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await safeFetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return false;
    
    const content = await response.text();
    return (content.includes('<rss') || content.includes('<feed') || content.includes('<?xml')) && content.length > 0;
  } catch (e) {
    return false;
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const feeds = await base44.asServiceRole.entities.DirectoryFeed.list();
    
    let validated = 0;
    let deleted = 0;
    const invalidFeeds = [];
    
    // Test feeds in batches of 10
    const batchSize = 10;
    for (let i = 0; i < feeds.length; i += batchSize) {
      const batch = feeds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(feed => validateFeedUrl(feed.url).then(isValid => ({ feed, isValid })))
      );
      
      for (const { feed, isValid } of results) {
        if (isValid) {
          validated++;
        } else {
          invalidFeeds.push({ id: feed.id, name: feed.name, url: feed.url });
          await base44.asServiceRole.entities.DirectoryFeed.delete(feed.id);
          deleted++;
        }
      }
    }

    return Response.json({
      total: feeds.length,
      validated,
      deleted,
      invalidFeeds
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
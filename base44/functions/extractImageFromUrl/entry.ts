import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';


// ── SSRF guard (2026-09-25) ────────────────────────────────────────────────────
// Every outbound fetch of a user-supplied URL goes through safeFetch: http(s) only, no
// localhost / private / link-local / metadata hosts, DNS answers checked when the runtime
// allows it, and redirects followed manually so each hop is re-validated (a public URL that
// 302s to 169.254.169.254 used to sail through).
const __BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data', '0.0.0.0']);
function __isPrivateIp(ip) {
    const h = ip.replace(/^\[|\]$/g, '').toLowerCase();
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true; // CGNAT
    if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    if (/^::ffff:/.test(h)) return __isPrivateIp(h.replace(/^::ffff:/, ''));
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();

    if (!url) {
      return Response.json({ error: 'URL is required' }, { status: 400 });
    }

    // SSRF guard: http(s) only, no localhost / private / link-local / metadata hosts
    let parsed;
    try { parsed = new URL(url); } catch { return Response.json({ error: 'Invalid URL' }, { status: 400 }); }
    const host = parsed.hostname.toLowerCase();
    const blocked = !['http:', 'https:'].includes(parsed.protocol)
      || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')
      || host === 'metadata.google.internal' || host === '0.0.0.0' || host.startsWith('[')
      || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
      || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (blocked) return Response.json({ error: 'URL not allowed' }, { status: 400 });

    // Fetch the article page with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let html;
    try {
      const response = await safeFetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return Response.json({ imageUrl: null });
      }

      html = await response.text();
    } catch (e) {
      clearTimeout(timeoutId);
      return Response.json({ imageUrl: null });
    }

    // Extract image URL - try multiple strategies
    let imageUrl = null;

    // Strategy 1: og:image meta tag (most reliable for social sharing)
    const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogMatch) {
      imageUrl = ogMatch[1];
    }

    // Strategy 2: twitter:image meta tag
    if (!imageUrl) {
      const twitterMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
      if (twitterMatch) {
        imageUrl = twitterMatch[1];
      }
    }

    // Strategy 3: Look for first meaningful img tag (not tiny tracking pixels)
    if (!imageUrl) {
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:width|height)=["']([0-9]+)["'][^>]*>/gi;
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        const src = match[1];
        const size = parseInt(match[2], 10);
        // Skip tiny images (likely tracking pixels)
        if (size >= 200) {
          imageUrl = src;
          break;
        }
      }
    }

    // Strategy 4: First img tag without size constraints
    if (!imageUrl) {
      const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) {
        const src = imgMatch[1];
        // Skip data URIs and extremely short URLs
        if (!src.startsWith('data:') && src.length > 20) {
          imageUrl = src;
        }
      }
    }

    // Normalize the image URL to be absolute
    if (imageUrl) {
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        // Already absolute
      } else if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        // Relative to domain
        try {
          const urlObj = new URL(url);
          imageUrl = urlObj.origin + imageUrl;
        } catch {
          imageUrl = null;
        }
      }
    }

    return Response.json({ imageUrl });
  } catch (error) {
    return Response.json({ imageUrl: null });
  }
});
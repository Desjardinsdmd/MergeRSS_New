import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * checkFeedUrl — server-side health check for the Add Feed dialog.
 *
 * Replaces a browser call to api.allorigins.win, which sent every feed URL the user typed
 * (including private tokenized ones) to an unrelated third party. Returns the HTTP status
 * and the first 20 KB of the body so the dialog's existing classification logic still works.
 * Login required; SSRF-guarded.
 */

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
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json().catch(() => ({}));
    if (!url) return Response.json({ error: 'url required' }, { status: 400 });

    try {
        const res = await safeFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*' },
            signal: AbortSignal.timeout(12_000),
        });
        const text = (await res.text()).slice(0, 20_000);
        return Response.json({ http_status: res.status, ok: res.ok, body_head: text });
    } catch (err) {
        const msg = String(err?.message || err);
        if (msg.startsWith('SSRF_BLOCKED')) return Response.json({ error: 'blocked', blocked: true }, { status: 400 });
        const timeout = /abort|timeout/i.test(msg);
        return Response.json({ error: timeout ? 'timeout' : 'network_error', timeout }, { status: 200 });
    }
});

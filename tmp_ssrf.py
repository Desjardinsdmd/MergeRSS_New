import re, sys

SAFE_FETCH = r'''
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
'''

FILES = ['addSource', 'bulkImportSources', 'bulkImportFeeds', 'fetchSingleFeed', 'autoRepairSources',
         'fetchFeeds', 'extractImageFromUrl', 'fetchSources']

for name in FILES:
    p = f'base44/functions/{name}/entry.ts'
    s = open(p).read()
    if 'async function safeFetch(' in s:
        print('skip (already has safeFetch)', name); continue
    lines = s.split('\n')
    out, n = [], 0
    for line in lines:
        if 'await fetch(' in line and 'webhook_url' not in line:
            line = line.replace('await fetch(', 'await safeFetch(')
            n += 1
        out.append(line)
    s = '\n'.join(out)
    # insert helper after the last top-of-file import
    m = list(re.finditer(r'^import .*?;\s*$', s, flags=re.M))
    if not m:
        print('FAIL no import in', name); sys.exit(1)
    at = m[-1].end()
    s = s[:at] + '\n' + SAFE_FETCH + s[at:]
    open(p, 'w').write(s)
    print(f'{name}: {n} fetch call(s) now safeFetch')

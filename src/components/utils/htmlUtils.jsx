/**
 * Sanitize a URL from untrusted RSS content.
 * Rejects javascript: / data: / vbscript: URIs — only allows http(s) and feed-relative paths.
 * Returns '#' for any disallowed scheme so links are inert but the DOM stays valid.
 */
export function safeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  // Allow only http / https / mailto (never javascript:, data:, vbscript:, etc.)
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  // Relative URLs starting with / or ./ are acceptable
  if (/^\.?\/[^/]/i.test(trimmed)) return trimmed;
  return '#';
}

/**
 * Decode HTML entities from a string (both decimal and hex).
 * Handles common named entities and numeric character references.
 */
export function decodeHtml(str) {
  if (!str) return '';
  return str
    // Numeric character references first (before named entities)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    // Named entities (order matters: more specific before &amp;)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&hellip;/g, '…')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&bull;/g, '•')
    .replace(/&middot;/g, '·')
    .replace(/&times;/g, '×')
    .replace(/&divide;/g, '÷')
    // &amp; MUST be last
    .replace(/&amp;/g, '&');
}
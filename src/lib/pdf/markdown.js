/**
 * Minimal markdown to block model for the PDF renderer.
 *
 * Blocks:
 *   { type: 'heading', level, runs }
 *   { type: 'paragraph', runs, lead? }
 *   { type: 'list', ordered, items: [{ runs, num, lead? }] }
 *   { type: 'quote', runs }
 *   { type: 'rule' }
 *
 * Runs: { text, bold?, italic?, code?, href?, lead? }
 *
 * Output text is sanitised to the WinAnsi range that jsPDF's built-in
 * Helvetica and Courier can draw. Raw URLs never reach the page: links show
 * their label, or the bare domain when the label is itself a URL.
 */

const CHAR_MAP = [
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/\s*[—―]\s*/g, ' - '],
  [/[‐‑‒–−]/g, '-'],
  [/…/g, '...'],
  [/[•●▪■‣⁃]/g, '-'],
  [/[→⟶➜➔]/g, '->'],
  [/[←]/g, '<-'],
  [/[↑↗]/g, 'up'],
  [/[↓↘]/g, 'down'],
  [/[     ]/g, ' '],
  [/[​-‍﻿]/g, ''],
  [/€/g, 'EUR '],
  [/™/g, '(TM)'],
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: ' - ', ndash: '-', hellip: '...', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };

export function sanitizeText(input) {
  let s = String(input ?? '');
  s = s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
  for (const [re, rep] of CHAR_MAP) s = s.replace(re, rep);
  // Anything outside Latin-1 cannot be drawn by the standard PDF fonts.
  s = s.replace(/[^\t\n\r -~¡-ÿ]/gu, '');
  return s;
}

export function domainOf(url) {
  const m = String(url).match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:?#]+)/i);
  if (m) return m[1].replace(/^www\./i, '');
  if (/^mailto:/i.test(url)) return url.slice(7);
  return String(url).replace(/^www\./i, '').split(/[/?#]/)[0];
}

const looksLikeUrl = (s) => /^(https?:\/\/|www\.)\S+$/i.test(String(s).trim());

const LEAD_INS = /^(why it matters|what it means|what to watch|the takeaway|takeaway|bottom line|the big picture|between the lines|by the numbers|context|signal|watch for)\s*:/i;

// ─── Inline parsing ─────────────────────────────────────────────────────────

function pushText(runs, text, style) {
  if (!text) return;
  const last = runs[runs.length - 1];
  if (last && sameStyle(last, style)) last.text += text;
  else runs.push({ ...style, text });
}

function sameStyle(a, b) {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.code === !!b.code && (a.href || '') === (b.href || '') && !!a.lead === !!b.lead;
}

function linkRuns(label, href, style) {
  const inner = parseInlineRaw(label, { ...style, href });
  const plain = inner.map(r => r.text).join('').trim();
  if (!plain || looksLikeUrl(plain)) return [{ ...style, href, text: domainOf(href) }];
  return inner;
}

function parseInlineRaw(src, style = {}) {
  const runs = [];
  let buf = '';
  const flush = () => { pushText(runs, buf, style); buf = ''; };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);
    const prev = i > 0 ? src[i - 1] : ' ';
    let m;

    if (ch === '\\' && /[\\`*_{}[\]()#+\-.!>~|]/.test(src[i + 1] || '')) { buf += src[i + 1]; i += 2; continue; }

    if (ch === '!' && (m = rest.match(/^!\[([^\]]*)\]\(([^)]*)\)/))) { i += m[0].length; continue; }

    if (ch === '[' && (m = rest.match(/^\[((?:[^[\]]|\[[^\]]*\])+)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/))) {
      flush();
      for (const r of linkRuns(m[1], m[2], style)) pushText(runs, r.text, r);
      i += m[0].length; continue;
    }

    if (ch === '<' && (m = rest.match(/^<((?:https?:\/\/|mailto:)[^>\s]+)>/i))) {
      flush(); pushText(runs, domainOf(m[1]), { ...style, href: m[1] });
      i += m[0].length; continue;
    }

    if ((ch === 'h' || ch === 'w') && !style.href && /[\s(]/.test(prev) && (m = rest.match(/^(?:https?:\/\/|www\.)[^\s<>()[\]]*[^\s<>()[\].,;:!?'"]/i))) {
      flush();
      const href = /^www\./i.test(m[0]) ? `https://${m[0]}` : m[0];
      pushText(runs, domainOf(href), { ...style, href });
      i += m[0].length; continue;
    }

    if (ch === '`' && (m = rest.match(/^`([^`]+)`/))) {
      flush(); pushText(runs, m[1], { ...style, code: true });
      i += m[0].length; continue;
    }

    if ((ch === '*' || ch === '_') && (m = rest.match(/^(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/))) {
      flush();
      for (const r of parseInlineRaw(m[2], { ...style, bold: true, italic: true })) pushText(runs, r.text, r);
      i += m[0].length; continue;
    }

    if ((ch === '*' || ch === '_') && (m = rest.match(/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/))) {
      if (ch === '*' || !/\w/.test(prev)) {
        flush();
        for (const r of parseInlineRaw(m[2], { ...style, bold: true })) pushText(runs, r.text, r);
        i += m[0].length; continue;
      }
    }

    if (ch === '*' && (m = rest.match(/^\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/))) {
      flush();
      for (const r of parseInlineRaw(m[1], { ...style, italic: true })) pushText(runs, r.text, r);
      i += m[0].length; continue;
    }

    if (ch === '_' && !/\w/.test(prev) && (m = rest.match(/^_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/))) {
      flush();
      for (const r of parseInlineRaw(m[1], { ...style, italic: true })) pushText(runs, r.text, r);
      i += m[0].length; continue;
    }

    if (ch === '~' && (m = rest.match(/^~~(?=\S)([\s\S]*?\S)~~/))) {
      flush();
      for (const r of parseInlineRaw(m[1], style)) pushText(runs, r.text, r);
      i += m[0].length; continue;
    }

    buf += ch; i++;
  }
  flush();
  return runs;
}

/** Remove markdown punctuation that survived parsing (unbalanced markers). */
function scrub(text) {
  return text
    .replace(/\*\*+|__+(?=\s|$)|(?:^|(?<=\s))__+/g, '')
    .replace(/(^|\s)[*_](?=\S)/g, '$1')
    .replace(/(\S)[*_](?=\s|$|[.,;:!?)])/g, '$1')
    .replace(/(^|\s)#{1,6}(?=\s)/g, '$1')
    .replace(/`/g, '')
    .replace(/ {2,}/g, ' ');
}

export function parseInline(src) {
  const text = sanitizeText(src).replace(/\s*\n\s*/g, ' ');
  const runs = parseInlineRaw(text).map(r => (r.code ? r : { ...r, text: scrub(r.text) })).filter(r => r.text);
  return markLead(runs);
}

/** Style a known lead-in ("Why it matters:") at the start of a run list. */
function markLead(runs) {
  if (!runs.length) return runs;
  const plain = runs.map(r => r.text).join('');
  const m = plain.trimStart().match(LEAD_INS);
  if (!m) return runs;
  const offset = plain.length - plain.trimStart().length;
  let remaining = offset + m[0].length;
  const out = [];
  for (const r of runs) {
    if (remaining <= 0) { out.push(r); continue; }
    if (r.text.length <= remaining) {
      out.push({ ...r, lead: true, bold: true });
      remaining -= r.text.length;
    } else {
      out.push({ ...r, text: r.text.slice(0, remaining), lead: true, bold: true });
      out.push({ ...r, text: r.text.slice(remaining) });
      remaining = 0;
    }
  }
  return out;
}

export function runsToPlain(runs) {
  return runs.map(r => r.text).join('').replace(/\s+/g, ' ').trim();
}

export function plainText(src) {
  return runsToPlain(parseInline(src));
}

// ─── Block parsing ──────────────────────────────────────────────────────────

const RE = {
  heading: /^\s{0,3}(#{1,6})(?:\s+|(?=[^#\s]))(.*?)\s*#*\s*$/,
  bullet: /^(\s*)[-*+•]\s+(.*)$/,
  ordered: /^(\s*)(\d{1,3})[.)]\s+(.*)$/,
  rule: /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/,
  quote: /^\s*>\s?(.*)$/,
  fence: /^\s*(```|~~~)/,
  table: /^\s*\|.*\|\s*$/,
  tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
  boldHeading: /^\s*(\*\*|__)([^*_]{2,120})\1\s*:?\s*$/,
};

function isBlockStart(line) {
  return RE.heading.test(line) || RE.bullet.test(line) || RE.ordered.test(line) || RE.rule.test(line) || RE.quote.test(line) || RE.fence.test(line);
}

export function parseMarkdown(src) {
  const text = sanitizeText(src).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const blocks = [];
  let para = null;
  let list = null;
  let quote = null;

  const endPara = () => {
    if (para) {
      const runs = parseInline(para.join(' '));
      if (runs.length) blocks.push({ type: 'paragraph', runs });
    }
    para = null;
  };
  const endList = () => {
    if (list) {
      const items = list.items
        .map(it => ({ num: it.num, runs: parseInline(it.text.join(' ')) }))
        .filter(it => it.runs.length);
      if (items.length) blocks.push({ type: 'list', ordered: list.ordered, items });
    }
    list = null;
  };
  const endQuote = () => {
    if (quote) {
      const runs = parseInline(quote.join(' '));
      if (runs.length) blocks.push({ type: 'quote', runs });
    }
    quote = null;
  };
  const endAll = () => { endPara(); endList(); endQuote(); };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    let m;

    if (!line.trim()) { endPara(); endQuote(); if (list) list.blank = true; continue; }

    if (RE.fence.test(line)) {
      // Code fences: render the contents as a plain paragraph.
      endAll();
      const body = [];
      idx++;
      while (idx < lines.length && !RE.fence.test(lines[idx])) { body.push(lines[idx]); idx++; }
      const runs = parseInline(body.join(' '));
      if (runs.length) blocks.push({ type: 'paragraph', runs });
      continue;
    }

    if (RE.table.test(line)) {
      // Tables: each data row becomes a list item with cells joined.
      if (RE.tableSep.test(line)) continue;
      endPara(); endQuote();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean);
      if (!list || list.ordered) { endList(); list = { ordered: false, items: [] }; }
      list.items.push({ text: [cells.join('  |  ')] });
      continue;
    }

    if (RE.rule.test(line)) { endAll(); blocks.push({ type: 'rule' }); continue; }

    if ((m = line.match(RE.heading)) && m[2].trim()) {
      endAll();
      const level = m[1].length;
      // "#1 priority" style text is not a heading: one hash needs a space.
      if (level === 1 && !/^\s{0,3}#\s/.test(line)) { para = [line]; continue; }
      blocks.push({ type: 'heading', level: Math.min(level, 4), runs: parseInline(m[2]) });
      continue;
    }

    if ((m = line.match(RE.boldHeading)) && !para && !list) {
      endAll();
      blocks.push({ type: 'heading', level: 4, runs: parseInline(m[2]) });
      continue;
    }

    if ((m = line.match(RE.quote))) {
      endPara(); endList();
      if (!quote) quote = [];
      quote.push(m[1]);
      continue;
    }

    if ((m = line.match(RE.bullet)) || (m = line.match(RE.ordered))) {
      endPara(); endQuote();
      const ordered = m.length === 4;
      const textPart = ordered ? m[3] : m[2];
      const indent = m[1].length;
      if (list && list.ordered !== ordered && indent === 0) endList();
      if (!list) list = { ordered, items: [] };
      list.blank = false;
      const num = ordered ? parseInt(m[2], 10) : undefined;
      list.items.push({ text: [textPart], num: ordered ? (indent > 0 && !list.ordered ? undefined : num) : undefined, nested: indent > 0 });
      continue;
    }

    // Continuation lines.
    if (list && !list.blank && list.items.length && (/^\s{2,}/.test(line) || !isBlockStart(line))) {
      list.items[list.items.length - 1].text.push(line.trim());
      continue;
    }
    if (list) endList();
    if (quote) { quote.push(line.trim()); continue; }
    // AI copy often separates paragraphs with a single newline: a line that
    // ends a sentence closes the paragraph.
    if (para && /[.!?]["')\]]?$/.test(para[para.length - 1])) endPara();
    if (!para) para = [];
    para.push(line.trim());
  }
  endAll();

  // Number ordered lists sequentially when the source numbers are missing or repeated.
  for (const b of blocks) {
    if (b.type === 'list' && b.ordered) {
      let n = b.items[0]?.num || 1;
      b.items.forEach(it => { it.num = n++; });
    }
  }
  return blocks;
}

/**
 * Split a run list after its first sentence (used for the key takeaway).
 * Returns { first, rest } as run lists; sentence ends need a following
 * capital, digit or quote so "U.S. rates" style abbreviations survive.
 */
export function splitRunsAtFirstSentence(runs) {
  const plain = runs.map(r => r.text).join('');
  const re = /[.!?](?=["')\]]?\s+[A-Z0-9"'(])/g;
  let cut = -1;
  let m;
  while ((m = re.exec(plain))) {
    if (m.index >= 24) { cut = m.index + 1; break; }
  }
  if (cut < 0) return { first: runs, rest: [] };
  while (cut < plain.length && /["')\]]/.test(plain[cut])) cut++;
  const first = [];
  const rest = [];
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.text.length;
    if (end <= cut) first.push(r);
    else if (pos >= cut) rest.push(r);
    else {
      first.push({ ...r, text: r.text.slice(0, cut - pos) });
      rest.push({ ...r, text: r.text.slice(cut - pos) });
    }
    pos = end;
  }
  if (rest.length) rest[0] = { ...rest[0], text: rest[0].text.replace(/^\s+/, '') };
  return { first, rest: rest.filter(r => r.text) };
}

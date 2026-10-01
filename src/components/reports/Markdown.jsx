import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Small, safe markdown renderer for AI-written text (reports, briefing history).
 *
 * Supports: # to ###### headings, paragraphs, - * + bullet lists, 1. ordered lists,
 * > quotes, --- rules, **bold**, __bold__, *italic*, _italic_, `code`, [text](url).
 * Everything is rendered as React elements: raw HTML in the source is shown as text,
 * never injected, and links only allow http(s) and mailto URLs.
 */

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function safeHref(url) {
  const u = String(url || '').trim();
  return SAFE_URL.test(u) ? u : null;
}

// Inline tokens, tried in order at each position.
const INLINE_RULES = [
  { type: 'code', re: /^`([^`]+)`/ },
  { type: 'link', re: /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/ },
  { type: 'bold', re: /^\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/ },
  { type: 'bold', re: /^__([^_]+)__/ },
  { type: 'italic', re: /^\*([^*\s][^*]*?)\*/ },
  { type: 'italic', re: /^_([^_\s][^_]*?)_(?![A-Za-z0-9])/ },
  { type: 'url', re: /^(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/ },
];

function renderInline(text, keyPrefix = 'i') {
  const src = String(text ?? '');
  const out = [];
  let buf = '';
  let i = 0;
  let n = 0;
  const flush = () => {
    if (buf) { out.push(buf); buf = ''; }
  };
  while (i < src.length) {
    const rest = src.slice(i);
    const ch = src[i];
    let matched = false;
    if (ch === '`' || ch === '[' || ch === '*' || ch === '_' || ch === 'h') {
      // Underscore emphasis only at a word boundary, so snake_case stays intact.
      const prev = i > 0 ? src[i - 1] : ' ';
      for (const rule of INLINE_RULES) {
        if (rule.type === 'url' && ch !== 'h') continue;
        if (ch === '_' && /[A-Za-z0-9]/.test(prev)) continue;
        const m = rest.match(rule.re);
        if (!m) continue;
        const key = `${keyPrefix}-${n++}`;
        if (rule.type === 'code') {
          flush();
          out.push(<code key={key} className="rounded-md bg-white/[0.06] px-1 py-0.5 font-mono text-[0.85em] text-stone-200">{m[1]}</code>);
        } else if (rule.type === 'link') {
          const href = safeHref(m[2]);
          flush();
          out.push(href
            ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[#C4A5FD] underline decoration-[hsl(var(--brand)/0.4)] underline-offset-2 hover:text-white">{renderInline(m[1], key)}</a>
            : <span key={key}>{renderInline(m[1], key)}</span>);
        } else if (rule.type === 'url') {
          const href = safeHref(m[1]);
          if (!href) continue;
          flush();
          out.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" className="break-all text-[#C4A5FD] underline decoration-[hsl(var(--brand)/0.4)] underline-offset-2 hover:text-white">{m[1]}</a>);
        } else if (rule.type === 'bold') {
          flush();
          out.push(<strong key={key} className="font-semibold text-stone-100">{renderInline(m[1], key)}</strong>);
        } else if (rule.type === 'italic') {
          flush();
          out.push(<em key={key} className="italic">{renderInline(m[1], key)}</em>);
        }
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      buf += ch;
      i += 1;
    }
  }
  flush();
  return out;
}

const HEADING_CLASSES = {
  1: 'font-display text-xl font-semibold text-stone-100',
  2: 'font-display text-lg font-semibold text-stone-100',
  3: 'font-display text-base font-semibold text-stone-100',
  4: 'text-sm font-semibold text-stone-100',
  5: 'micro-label',
  6: 'micro-label',
};

const RE_HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_UL = /^\s*[-*+•]\s+(.*)$/;
const RE_OL = /^\s*(\d+)[.)]\s+(.*)$/;
const RE_QUOTE = /^\s*>\s?(.*)$/;
const RE_RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Parse markdown into a flat list of blocks. */
function parseBlocks(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let list = null;
  let quote = null;

  const endPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const endList = () => { if (list) { blocks.push(list); list = null; } };
  const endQuote = () => { if (quote) { blocks.push({ type: 'quote', text: quote.join(' ') }); quote = null; } };
  const endAll = () => { endPara(); endList(); endQuote(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { endAll(); continue; }

    let m;
    if (RE_RULE.test(line)) { endAll(); blocks.push({ type: 'hr' }); continue; }
    if ((m = line.match(RE_HEADING))) { endAll(); blocks.push({ type: 'h', level: m[1].length, text: m[2] }); continue; }
    if ((m = line.match(RE_UL))) {
      endPara(); endQuote();
      if (!list || list.type !== 'ul') { endList(); list = { type: 'ul', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(RE_OL))) {
      endPara(); endQuote();
      if (!list || list.type !== 'ol') { endList(); list = { type: 'ol', start: Number(m[1]) || 1, items: [] }; }
      list.items.push(m[2]);
      continue;
    }
    if ((m = line.match(RE_QUOTE))) {
      endPara(); endList();
      quote = quote || [];
      quote.push(m[1]);
      continue;
    }
    // Indented continuation of a list item
    if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    endList(); endQuote();
    para.push(line.trim());
  }
  endAll();
  return blocks;
}

/** True when the text uses block-level markdown (headings, lists, quotes, rules). */
export function hasBlockMarkdown(text) {
  return String(text ?? '').split(/\r?\n/).some(l => RE_HEADING.test(l) || RE_UL.test(l) || RE_OL.test(l) || RE_QUOTE.test(l) || RE_RULE.test(l));
}

/** Remove markdown syntax, leaving readable plain text (for previews, PDFs, sentence splitting). */
export function stripMarkdown(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+•]\s+/gm, '')
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1$2')
    .replace(/(^|\W)_([^_\s][^_]*?)_(?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

/** Inline-only markdown (bold, italics, links, code) for single-line strings such as titles. */
export function MarkdownInline({ text, className }) {
  const flat = String(text ?? '').replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s*\n\s*/g, ' ');
  return <span className={className}>{renderInline(flat)}</span>;
}

/**
 * Block markdown renderer.
 * `size`: 'sm' (default, text-sm) or 'xs' for dense lists.
 */
export default function Markdown({ text, className, size = 'sm' }) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  if (!blocks.length) return null;
  const body = size === 'xs' ? 'text-xs leading-relaxed' : 'text-sm leading-[1.75]';

  return (
    <div className={cn('space-y-3 text-stone-300', body, className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case 'h': {
            const Tag = `h${Math.min(b.level + 2, 6)}`;
            return <Tag key={key} className={cn(HEADING_CLASSES[b.level], 'pt-1')}>{renderInline(b.text, key)}</Tag>;
          }
          case 'ul':
            return (
              <ul key={key} className="space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-[0.6em] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{renderInline(it, `${key}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="flex-shrink-0 font-mono text-[0.85em] text-[hsl(var(--primary))]">{String(b.start + j).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1">{renderInline(it, `${key}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={key} className="rounded-r-xl border-l-2 border-[hsl(var(--primary)/0.6)] bg-white/[0.03] px-4 py-2 text-stone-300">
                {renderInline(b.text, key)}
              </blockquote>
            );
          case 'hr':
            return <hr key={key} className="border-white/[0.07]" />;
          default:
            return <p key={key}>{renderInline(b.text, key)}</p>;
        }
      })}
    </div>
  );
}

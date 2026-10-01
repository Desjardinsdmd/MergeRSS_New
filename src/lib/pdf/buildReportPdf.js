/**
 * MergeRSS intelligence report PDF (design system v3, "briefing studio").
 *
 * Pure layout: builds and returns a jsPDF document without touching the DOM,
 * so it runs in the browser and in node. generatePremiumPdf() saves it.
 *
 * Layout model: a single continuous flow. Every block is broken into items
 * ({ h, draw(y) }) and panels are drawn around runs of items, so content can
 * break between lines on any page while headings stay with what follows.
 */

import { jsPDF } from 'jspdf';
import { format, parseISO, isValid, differenceInCalendarDays } from 'date-fns';
import { C, G, PT, RADIUS, TONES, TRAJECTORY, FONT, mix } from './tokens.js';
import {
  setFont, color, panel, hline, vline, dot, glow, mono, fitMono, wrapMono,
  chip, chipSize, logoMark, layoutRuns, drawLine, rect,
} from './draw.js';
import { parseMarkdown, parseInline, runsToPlain, sanitizeText, splitRunsAtFirstSentence } from './markdown.js';

// ─── Dates ──────────────────────────────────────────────────────────────────

function toDate(v) {
  if (!v) return null;
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseISO(v) : new Date(v);
  return isValid(d) ? d : null;
}

function fmt(v, pattern) {
  const d = toDate(v);
  return d ? format(d, pattern) : '';
}

function rangeLabel(start, end) {
  const s = toDate(start);
  const e = toDate(end);
  if (s && e) {
    if (format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')) return format(s, 'MMM d, yyyy');
    if (s.getFullYear() === e.getFullYear()) return `${format(s, 'MMM d')} - ${format(e, 'MMM d, yyyy')}`;
    return `${format(s, 'MMM d, yyyy')} - ${format(e, 'MMM d, yyyy')}`;
  }
  return [start, end].filter(Boolean).map(v => sanitizeText(v)).join(' - ');
}

// ─── Text styles ────────────────────────────────────────────────────────────

const LINE = (size, factor = 1.5) => size * PT * factor;

const ST = {
  body: { size: 9.8, rgb: C.body, strong: C.strong, lh: LINE(9.8, 1.55) },
  muted: { size: 9.3, rgb: C.muted, strong: C.body, lh: LINE(9.3, 1.55) },
  takeaway: { size: 12, rgb: C.strong, strong: C.strong, lh: LINE(12, 1.42) },
  h2: { size: 13, rgb: C.strong, bold: true, lh: LINE(13, 1.3) },
  h3: { size: 11.2, rgb: C.strong, bold: true, lh: LINE(11.2, 1.32) },
  themeTitle: { size: 11.2, rgb: C.strong, bold: true, lh: LINE(11.2, 1.32) },
  event: { size: 10.4, rgb: C.strong, bold: true, lh: LINE(10.4, 1.35) },
  cell: { size: 9.3, rgb: C.body, strong: C.strong, lh: LINE(9.3, 1.5) },
};

/** Baseline inside a line box of height lh for a font of `size` pt. */
const baseline = (y, lh, size) => y + lh / 2 + size * PT * 0.35;

// ─── Items ──────────────────────────────────────────────────────────────────

const spacer = (h, draw) => ({ h, spacer: true, draw: draw || (() => {}) });

function textItems(doc, runs, x, w, style, extra = {}) {
  const lines = layoutRuns(doc, runs, w, style);
  return lines.map((line, i) => ({
    h: style.lh,
    text: true,
    draw: (y) => {
      if (extra.before) extra.before(y, i);
      drawLine(doc, line, x, baseline(y, style.lh, style.size), style);
    },
  }));
}

function monoItems(doc, text, x, w, { size = 7, rgb = C.violetLight, charSpace = 0.35, style = 'bold', lh = 4.6 } = {}) {
  const lines = wrapMono(doc, String(text).toUpperCase(), w, size, charSpace, style);
  return lines.map(l => ({
    h: lh,
    text: true,
    draw: (y) => mono(doc, l, x, baseline(y, lh, size), { size, rgb, charSpace, style }),
  }));
}

/**
 * Markdown blocks to items.
 * opts: { style: ST.body | ST.muted, signals: render ordered lists as numbered chips }
 */
function markdownItems(doc, blocks, x, w, opts = {}) {
  const style = opts.style || ST.body;
  const out = [];
  const paraGap = style.size * PT * 0.85;

  blocks.forEach((b, bi) => {
    const first = bi === 0;
    if (b.type === 'heading') {
      if (!first) out.push(spacer(b.level <= 2 ? 4.5 : 3.6));
      let items;
      if (b.level <= 2) items = textItems(doc, b.runs, x, w, ST.h2);
      else if (b.level === 3) items = textItems(doc, b.runs, x, w, ST.h3);
      else items = monoItems(doc, runsToPlain(b.runs), x, w);
      items[items.length - 1].keep = 2;
      out.push(...items);
      out.push(spacer(b.level <= 3 ? 1.6 : 1.2));
      return;
    }
    if (b.type === 'paragraph') {
      out.push(...textItems(doc, b.runs, x, w, style));
      out.push(spacer(paraGap));
      return;
    }
    if (b.type === 'quote') {
      const qx = x + 4.5;
      const items = textItems(doc, b.runs, qx, w - 4.5, { ...style, italic: true, rgb: C.muted });
      items.forEach(it => {
        const d = it.draw;
        it.draw = (y) => { rect(doc, x + 0.4, y, 0.8, it.h, C.violet); d(y); };
      });
      out.push(...items, spacer(paraGap));
      return;
    }
    if (b.type === 'rule') {
      out.push({ h: 6, draw: (y) => hline(doc, x, x + w, y + 3, C.line, 0.25) });
      return;
    }
    if (b.type === 'list') {
      b.items.forEach((item, ii) => {
        const signal = b.ordered && opts.signals;
        const indent = signal ? 9 : 5.2;
        const items = textItems(doc, item.runs, x + indent, w - indent, style);
        if (!items.length) return;
        const firstDraw = items[0].draw;
        const lh = style.lh;
        items[0].draw = (y) => {
          if (signal) {
            const s = 5.6;
            const cy = y + lh / 2;
            panel(doc, x, cy - s / 2, s, s, { bg: TONES.violet.bg, border: TONES.violet.border, radius: 1.3, lw: 0.2 });
            const n = String(item.num);
            setFont(doc, FONT.display, 'bold', 7.4);
            color(doc, C.violetLight);
            doc.text(n, x + s / 2, cy + 7.4 * PT * 0.36, { align: 'center' });
          } else if (b.ordered) {
            mono(doc, `${item.num}.`, x, baseline(y, lh, style.size), { size: style.size * 0.82, rgb: C.violetLight, style: 'bold', charSpace: 0 });
          } else {
            dot(doc, x + 1.3, y + lh / 2 - 0.15, 0.75, C.violet);
          }
          firstDraw(y);
        };
        out.push(...items);
        if (ii < b.items.length - 1) out.push(spacer(signal ? 2.6 : 1.3));
      });
      out.push(spacer(paraGap));
      return;
    }
  });
  // Drop trailing spacers.
  while (out.length && out[out.length - 1].spacer) out.pop();
  return out;
}

const sumH = (items) => items.reduce((s, it) => s + it.h, 0);

// ─── Flow ───────────────────────────────────────────────────────────────────

class Flow {
  constructor(doc, ctx) {
    this.doc = doc;
    this.ctx = ctx;
    this.y = G.contentTop;
    this.fresh = true;
  }

  newPage() {
    this.doc.addPage('letter', 'portrait');
    paintInterior(this.doc, this.ctx);
    this.y = G.contentTop;
    this.fresh = true;
  }

  remaining() { return G.bottom - this.y; }

  ensure(h) { if (h > this.remaining() && !this.fresh) this.newPage(); }

  gap(h) {
    if (this.fresh) return;
    this.y += h;
    if (this.y > G.bottom) this.newPage();
  }

  /** Height needed for item i plus the items it must stay with. */
  need(list, i) {
    let h = list[i].h;
    let keep = list[i].keep || 0;
    for (let j = i + 1; j < list.length && keep > 0; j++) {
      h += list[j].h;
      if (list[j].text) keep--;
    }
    return h;
  }

  items(list) {
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.spacer && this.fresh) continue;
      if (it.spacer) {
        if (this.y + it.h > G.bottom) { this.newPage(); continue; }
      } else {
        this.ensure(this.need(list, i));
      }
      it.draw(this.y);
      this.y += it.h;
      this.fresh = false;
    }
  }

  /**
   * Draw items inside a rounded panel, splitting across pages when needed.
   * opts: { padT, padB, bg, border, accent: draw(y, h) for decorations, whole: max height to move intact }
   */
  panel(list, opts = {}) {
    const { padT = 6, padB = 6, bg = C.panel, border = C.hairline, accent } = opts;
    const total = padT + sumH(list) + padB;
    const drawSeg = (seg) => {
      const h = padT + sumH(seg) + padB;
      panel(this.doc, G.mX, this.y, G.col, h, { bg, border });
      if (accent) accent(this.y, h);
      let yy = this.y + padT;
      for (const it of seg) { it.draw(yy); yy += it.h; }
      this.y += h;
      this.fresh = false;
    };

    if (total <= this.remaining()) { drawSeg(list); return; }
    const moveWhole = total <= G.bodyH && (total <= G.bodyH * 0.55 || this.remaining() < 45);
    if (moveWhole) { this.newPage(); drawSeg(list); return; }

    let idx = 0;
    while (idx < list.length) {
      const avail = this.remaining() - padT - padB;
      let j = idx;
      let used = 0;
      while (j < list.length && used + list[j].h <= avail) { used += list[j].h; j++; }
      // Do not end a segment on a heading or leave fewer than 2 lines behind it.
      while (j > idx + 1 && j < list.length && (list[j - 1].keep || list[j - 1].spacer)) { j--; used -= list[j].h; }
      if (j === idx || (j < list.length && j - idx < 2 && !this.fresh)) {
        if (!this.fresh) { this.newPage(); continue; }
        j = Math.max(j, idx + 1);
      }
      let seg = list.slice(idx, j);
      while (seg.length > 1 && seg[seg.length - 1].spacer) seg = seg.slice(0, -1);
      while (seg.length > 1 && seg[0].spacer) seg = seg.slice(1);
      drawSeg(seg);
      idx = j;
      if (idx < list.length) this.newPage();
    }
  }
}

// ─── Page chrome ────────────────────────────────────────────────────────────

function paintInterior(doc, ctx) {
  rect(doc, 0, 0, G.pageW, G.pageH, C.ink);
  glow(doc, 6, 4, 70, 6, 0.022);
  logoMark(doc, G.mX, 8.6, 6.2);
  setFont(doc, FONT.display, 'bold', 9.5);
  color(doc, C.strong);
  doc.text('MergeRSS', G.mX + 8.6, 13.1);
  const label = fitMono(doc, ctx.title.toUpperCase(), 110, 6.4, 0.5);
  mono(doc, label, G.pageW - G.mX, 12.9, { size: 6.4, rgb: C.meta, charSpace: 0.25, align: 'right' });
  hline(doc, G.mX, G.pageW - G.mX, 19, C.hairline, 0.25);
}

function stampFooters(doc, ctx) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    hline(doc, G.mX, G.pageW - G.mX, G.footerLine, C.hairline, 0.25);
    const y = G.footerLine + 6;
    const opts = { size: 6.3, rgb: C.meta, charSpace: 0.25 };
    mono(doc, 'MergeRSS intelligence report', G.mX, y, opts);
    if (ctx.generated) mono(doc, ctx.generated, G.pageW / 2, y, { ...opts, align: 'center' });
    mono(doc, `${p} / ${n}`, G.pageW - G.mX, y, { ...opts, rgb: C.muted, align: 'right' });
  }
}

// ─── Cover ──────────────────────────────────────────────────────────────────

function buildCover(doc, ctx) {
  rect(doc, 0, 0, G.pageW, G.pageH, C.ink);
  glow(doc, 24, 18, 150, 22, 0.016);

  // Lockup
  const top = 24;
  logoMark(doc, G.mX, top, 12);
  setFont(doc, FONT.display, 'bold', 15);
  color(doc, C.strong);
  doc.text('MergeRSS', G.mX + 16, top + 5.6);
  mono(doc, 'briefing studio', G.mX + 16.2, top + 10.4, { size: 7, rgb: C.meta, charSpace: 0.17, upper: false });

  // Title block
  let y = 96;
  mono(doc, 'Intelligence report', G.mX, y, { size: 8, rgb: C.violet, charSpace: 0.65, style: 'bold' });
  y += 13;
  const titleSize = ctx.title.length > 60 ? 25 : 30;
  setFont(doc, FONT.display, 'bold', titleSize);
  color(doc, C.strong);
  let lines = doc.splitTextToSize(ctx.title, G.col - 6);
  if (lines.length > 4) {
    lines = lines.slice(0, 4);
    lines[3] = `${lines[3].replace(/\s*\S*$/, '')}...`;
  }
  const tlh = titleSize * PT * 1.12;
  lines.forEach((l, i) => doc.text(l, G.mX - 0.6, y + i * tlh));
  y += (lines.length - 1) * tlh + 9.5;

  setFont(doc, FONT.body, 'normal', 11.5);
  color(doc, C.muted);
  doc.text(ctx.subtitle, G.mX, y);
  y += 8;
  if (ctx.range) {
    mono(doc, ctx.range, G.mX, y, { size: 8, rgb: C.body, charSpace: 0.35 });
    y += 4;
  }

  // Stat row
  const stats = ctx.stats;
  if (stats.length) {
    y += 12;
    const h = 27;
    panel(doc, G.mX, y, G.col, h);
    const cw = G.col / stats.length;
    stats.forEach((s, i) => {
      const cx = G.mX + i * cw + 7;
      if (i > 0) vline(doc, G.mX + i * cw, y + 5, y + h - 5, C.hairline, 0.25);
      setFont(doc, FONT.display, 'bold', 24);
      color(doc, i === 0 ? C.violetLight : C.strong);
      doc.text(String(s.value), cx, y + 14.5);
      mono(doc, s.label, cx, y + 21.5, { size: 6.3, rgb: C.meta, charSpace: 0.28 });
    });
    y += h;
  }

  // Prepared / generated panel
  y += 8;
  const ph = 21;
  panel(doc, G.mX, y, G.col, ph);
  const half = G.col / 2;
  mono(doc, 'Prepared by', G.mX + 7, y + 8, { size: 6.3, rgb: C.meta });
  setFont(doc, FONT.display, 'bold', 10.5);
  color(doc, C.strong);
  doc.text('MergeRSS', G.mX + 7, y + 15);
  vline(doc, G.mX + half, y + 5, y + ph - 5);
  mono(doc, 'Generated', G.mX + half + 7, y + 8, { size: 6.3, rgb: C.meta });
  setFont(doc, FONT.display, 'bold', 10.5);
  color(doc, C.strong);
  doc.text(ctx.generatedLong || '-', G.mX + half + 7, y + 15);

  // Disclaimer, anchored above the footer
  const disc = 'This report was generated by MergeRSS from the briefings delivered in the period shown. It is an AI-assisted analysis for information only and reflects the sources available within that range.';
  setFont(doc, FONT.body, 'normal', 7.4);
  color(doc, C.faint);
  const dl = doc.splitTextToSize(disc, G.col * 0.78);
  const dy = G.footerLine - 8 - (dl.length - 1) * 3.6;
  dl.forEach((l, i) => doc.text(l, G.mX, dy + i * 3.6));
}

// ─── Sections ───────────────────────────────────────────────────────────────

const BAND_H = 10.5;

function sectionBand(flow, num, label) {
  const { doc } = flow;
  flow.gap(7);
  flow.ensure(BAND_H + 4 + 26);
  const y = flow.y;
  const first = num === 1;
  if (first) panel(doc, G.mX, y, G.col, BAND_H, { bg: C.violet, border: null, radius: RADIUS.band });
  else panel(doc, G.mX, y, G.col, BAND_H, { radius: RADIUS.band });
  const n = String(num).padStart(2, '0');
  const by = y + BAND_H / 2 + 10 * PT * 0.35;
  setFont(doc, FONT.display, 'bold', 10);
  color(doc, first ? C.white : C.violet);
  doc.text(n, G.mX + 5, by);
  vline(doc, G.mX + 13.5, y + 3, y + BAND_H - 3, first ? mix(C.white, C.violet, 0.45) : C.line, 0.25);
  mono(doc, label, G.mX + 17.5, y + BAND_H / 2 + 7.2 * PT * 0.36, {
    size: 7.2, rgb: first ? C.white : C.muted, charSpace: 0.45, style: 'bold',
  });
  flow.y += BAND_H;
  flow.fresh = false;
  flow.y += 5;
}

function warningCard(flow, msg) {
  const { doc } = flow;
  const t = TONES.amber;
  const x = G.mX + 13;
  const items = [
    ...monoItems(doc, 'Data range', x, G.col - 19, { size: 6.5, rgb: C.amber, charSpace: 0.3, lh: 4.4 }),
    ...textItems(doc, parseInline(msg), x, G.col - 19, { size: 9, rgb: mix(C.amber, C.strong, 0.55), lh: LINE(9, 1.45) }),
  ];
  flow.panel(items, {
    padT: 4.5, padB: 4.5, bg: mix(C.amber, C.ink, 0.1), border: t.border,
    accent: (y) => {
      dot(flow.doc, G.mX + 6.8, y + 7.6, 2.6, mix(C.amber, C.ink, 0.25));
      setFont(doc, FONT.display, 'bold', 8.5);
      color(doc, C.amber);
      doc.text('!', G.mX + 6.8, y + 7.6 + 8.5 * PT * 0.36, { align: 'center' });
    },
  });
  flow.y += 2;
}

function executiveSummary(flow, r) {
  const { doc } = flow;
  const blocks = parseMarkdown(r.executive_summary || '');
  if (!blocks.length) return;

  // Key takeaway = first sentence of the first paragraph (or a lone heading).
  let takeaway = null;
  const pi = blocks.findIndex(b => b.type === 'paragraph');
  if (pi >= 0 && pi <= 1) {
    const { first, rest } = splitRunsAtFirstSentence(blocks[pi].runs);
    takeaway = first;
    if (rest.length) blocks[pi] = { ...blocks[pi], runs: rest };
    else blocks.splice(pi, 1);
    if (pi === 1 && blocks[0].type === 'heading') blocks.splice(0, 1);
  } else if (blocks[0].type === 'heading' || blocks[0].type === 'list') {
    const b = blocks.shift();
    takeaway = b.type === 'heading' ? b.runs : b.items[0].runs;
  }

  if (takeaway && takeaway.length) {
    const x = G.mX + 9;
    const w = G.col - 16;
    const items = [
      ...monoItems(doc, 'Key takeaway', x, w, { size: 6.6, rgb: C.violetLight, charSpace: 0.4, lh: 4.6 }),
      spacer(1.8),
      ...textItems(doc, takeaway, x, w, ST.takeaway),
    ];
    flow.panel(items, {
      padT: 6, padB: 6.5,
      accent: (y, h) => panel(doc, G.mX + 3.6, y + 4.5, 1.2, h - 9, { bg: C.violet, border: null, radius: 0.6 }),
    });
    flow.gap(6);
  }

  flow.items(markdownItems(doc, blocks, G.mX + 1, G.col - 2, { style: ST.body }));
}

function keyThemes(flow, themes) {
  const { doc } = flow;
  themes.forEach((t, i) => {
    const traj = TRAJECTORY[String(t.trajectory || '').toLowerCase()] || null;
    const x = G.mX + 6;
    const numW = 13;
    const tx = x + numW;
    const badge = traj ? chipSize(doc, traj.label) : { w: 0, h: 0 };
    const titleW = G.col - 12 - numW - (badge.w ? badge.w + 4 : 0);
    const titleRuns = parseInline(t.theme || t.title || `Theme ${i + 1}`).map(r => ({ ...r, bold: true }));
    const titleItems = textItems(doc, titleRuns, tx, titleW, ST.themeTitle);
    const titleH = sumH(titleItems);

    const header = {
      h: titleH,
      text: true,
      keep: 2,
      draw: (y) => {
        setFont(doc, FONT.display, 'bold', 15);
        color(doc, i === 0 ? C.violet : C.meta);
        doc.text(String(i + 1).padStart(2, '0'), x, baseline(y, ST.themeTitle.lh, 15) + 0.4);
        let yy = y;
        for (const it of titleItems) { it.draw(yy); yy += it.h; }
        if (traj) chip(doc, traj.label, G.mX + G.col - 6 - badge.w, y + (ST.themeTitle.lh - badge.h) / 2, traj.tone);
      },
    };
    const desc = t.description ? markdownItems(doc, parseMarkdown(t.description), tx, G.col - 12 - numW, { style: ST.muted }) : [];
    const items = desc.length ? [header, spacer(2), ...desc] : [header];
    flow.panel(items, { padT: 5.5, padB: 5.5 });
    if (i < themes.length - 1) flow.gap(3.2);
  });
}

function trajectories(flow, r) {
  const { doc } = flow;
  const defs = [
    { items: r.escalating_topics, label: 'Escalating', tone: TONES.emerald },
    { items: r.deescalating_topics, label: 'De-escalating', tone: TONES.red },
    { items: r.cyclical_topics, label: 'Cyclical', tone: TONES.sky },
  ].filter(d => Array.isArray(d.items) && d.items.some(s => String(s || '').trim()));
  if (!defs.length) return;

  const gutter = 4;
  const n = defs.length;
  const colW = (G.col - gutter * (n - 1)) / n;
  const pad = 5;

  const build = (d, x, w) => {
    const header = {
      h: 6,
      text: true,
      keep: 1,
      draw: (y) => {
        dot(doc, x + 1, y + 2.6, 1.1, d.tone.fg);
        mono(doc, d.label, x + 4.2, y + 3.7, { size: 6.8, rgb: d.tone.fg, charSpace: 0.35, style: 'bold' });
        mono(doc, String(d.items.length), x + w, y + 3.7, { size: 6.8, rgb: C.meta, charSpace: 0, align: 'right' });
      },
    };
    const out = [header, spacer(2.2)];
    d.items.filter(s => String(s || '').trim()).forEach((s, i, arr) => {
      const its = textItems(doc, parseInline(String(s)), x + 4.2, w - 4.2, ST.cell);
      const d0 = its[0].draw;
      its[0].draw = (y) => { dot(doc, x + 1, y + ST.cell.lh / 2 - 0.1, 0.65, d.tone.fg); d0(y); };
      out.push(...its);
      if (i < arr.length - 1) out.push(spacer(1.6));
    });
    return out;
  };

  const cols = defs.map((d, i) => {
    const x = G.mX + i * (colW + gutter);
    return { d, x, items: build(d, x + pad, colW - pad * 2) };
  });
  const maxH = Math.max(...cols.map(c => sumH(c.items))) + pad * 2;

  if (maxH > G.bodyH * 0.8) {
    // Very long lists: stack columns as full-width panels so they can split.
    cols.forEach((c, i) => {
      flow.panel(build(c.d, G.mX + pad, G.col - pad * 2), { padT: pad, padB: pad });
      if (i < cols.length - 1) flow.gap(3);
    });
    return;
  }

  flow.ensure(maxH);
  const y = flow.y;
  cols.forEach(c => {
    panel(doc, c.x, y, colW, maxH, { bg: C.panel });
    hline(doc, c.x + pad, c.x + colW - pad, y + pad + 7.2, mix(c.d.tone.fg, C.panel, 0.25), 0.2);
    let yy = y + pad;
    for (const it of c.items) { it.draw(yy); yy += it.h; }
  });
  flow.y += maxH;
  flow.fresh = false;
}

function timeline(flow, points) {
  const { doc } = flow;
  const spineX = G.mX + 3.2;
  const tx = G.mX + 11;
  const tw = G.col - 12;
  const items = [];
  const spine = (y1, y2) => { if (y2 > y1) vline(doc, spineX, y1, y2, C.line, 0.3); };
  const last = points.length - 1;

  points.forEach((pt, i) => {
    const hasNext = i < last;
    const dateLh = 5.4;
    const dateText = sanitizeText(pt.date || '').trim();
    items.push({
      h: dateLh,
      text: true,
      keep: 2,
      draw: (y) => {
        const cy = y + dateLh / 2 - 0.2;
        if (i > 0) spine(y, cy);
        if (hasNext) spine(cy, y + dateLh);
        dot(doc, spineX, cy, 2.5, C.ink);
        dot(doc, spineX, cy, 2.1, mix(C.violet, C.ink, 0.28));
        dot(doc, spineX, cy, 1.25, C.violet);
        if (dateText) mono(doc, fitMono(doc, dateText.toUpperCase(), tw, 6.8, 0.35, 'bold'), tx, cy + 6.8 * PT * 0.36, { size: 6.8, rgb: C.violetLight, charSpace: 0.35, style: 'bold' });
      },
    });
    const withSpine = (list) => list.map(it => {
      const d = it.draw;
      return { ...it, draw: (y) => { if (hasNext) spine(y, y + it.h); d(y); } };
    });
    items.push(...withSpine([spacer(0.8)]));
    const ev = parseInline(pt.event || '').map(r => ({ ...r, bold: true }));
    if (ev.length) items.push(...withSpine(textItems(doc, ev, tx, tw, ST.event)));
    if (pt.significance) {
      items.push(...withSpine([spacer(1)]));
      items.push(...withSpine(markdownItems(doc, parseMarkdown(pt.significance), tx, tw, { style: ST.muted })));
    }
    if (hasNext) items.push(spacer(5.5, (y) => spine(y, y + 5.5)));
  });
  flow.items(items);
}

function outlook(flow, text) {
  const blocks = parseMarkdown(text);
  flow.items(markdownItems(flow.doc, blocks, G.mX + 1, G.col - 2, { style: ST.body, signals: true }));
}

function dataSummary(flow, cells) {
  const { doc } = flow;
  const gutter = 4;
  const n = cells.length;
  const w = (G.col - gutter * (n - 1)) / n;
  const pad = 5.5;
  const valStyle = { size: 11, rgb: C.strong, bold: true, lh: LINE(11, 1.3) };
  const built = cells.map((c, i) => {
    const x = G.mX + i * (w + gutter);
    const vals = textItems(doc, parseInline(c.value).map(r => ({ ...r, bold: true })), x + pad, w - pad * 2, valStyle);
    return { x, c, vals, h: pad * 2 + 6 + sumH(vals) };
  });
  const h = Math.max(...built.map(b => b.h));
  flow.ensure(h);
  const y = flow.y;
  built.forEach(b => {
    panel(doc, b.x, y, w, h);
    mono(doc, b.c.label, b.x + pad, y + pad + 2.4, { size: 6.3, rgb: C.meta, charSpace: 0.28 });
    let yy = y + pad + 6;
    for (const it of b.vals) { it.draw(yy); yy += it.h; }
  });
  flow.y += h;
  flow.fresh = false;
}

function endMark(flow) {
  const h = 14;
  if (flow.remaining() < h + 4) return;
  const { doc } = flow;
  const y = flow.y + 10;
  const cx = G.pageW / 2;
  hline(doc, cx - 34, cx - 13, y, C.line, 0.25);
  hline(doc, cx + 13, cx + 34, y, C.line, 0.25);
  mono(doc, 'End of report', cx, y + 1.1, { size: 6.3, rgb: C.faint, charSpace: 0.3, align: 'center' });
  flow.y += h;
}

// ─── Main ───────────────────────────────────────────────────────────────────

/** True when markdown has something beyond headings (a lone "# Daily briefing" is not a summary). */
const hasProse = (v) => parseMarkdown(String(v || '')).some(b => b.type !== 'heading' && b.type !== 'rule');

const nonEmpty = (v) => (Array.isArray(v) ? v.some(x => (typeof x === 'string' ? x.trim() : x)) : !!String(v || '').trim());

/**
 * Remove a leading line of the outlook that repeats the executive summary
 * (the Inbox export passes the first line of a briefing as the summary and
 * the whole briefing as the outlook).
 */
function dedupeOutlook(outlookText, summary) {
  if (!outlookText || !summary) return outlookText;
  const lines = String(outlookText).split(/\r?\n/);
  const idx = lines.findIndex(l => l.trim());
  if (idx >= 0 && lines[idx].trim() === String(summary).trim()) {
    lines.splice(idx, 1);
    return lines.join('\n');
  }
  return outlookText;
}

/**
 * @param {object} savedReport  { report, digest_name, start_date, end_date, delivery_count, actual_start?, actual_end? }
 * @param {object} [opts]       { now?: Date }
 * @returns {{ doc: jsPDF, filename: string }}
 */
export function buildReportPdf(savedReport = {}, opts = {}) {
  const r = savedReport.report || {};
  const title = sanitizeText(savedReport.digest_name || 'Intelligence report').trim() || 'Intelligence report';
  const startDate = savedReport.start_date || '';
  const endDate = savedReport.end_date || '';
  const deliveryCount = Number(savedReport.delivery_count) || 0;
  const ds = r.data_summary || {};
  const now = opts.now || new Date();

  const briefings = Number(ds.digest_count) || deliveryCount || 0;
  const themes = Array.isArray(r.key_themes) ? r.key_themes.filter(t => t && (t.theme || t.description)) : [];
  const points = Array.isArray(r.inflection_points) ? r.inflection_points.filter(p => p && (p.event || p.significance)) : [];
  const s = toDate(startDate);
  const e = toDate(endDate);
  const days = s && e ? Math.abs(differenceInCalendarDays(e, s)) + 1 : 0;

  const stats = [
    briefings ? { value: briefings, label: briefings === 1 ? 'Briefing analysed' : 'Briefings analysed' } : null,
    themes.length ? { value: themes.length, label: themes.length === 1 ? 'Key theme' : 'Key themes' } : null,
    points.length ? { value: points.length, label: points.length === 1 ? 'Inflection point' : 'Inflection points' } : null,
    days > 1 ? { value: days, label: 'Days covered' } : null,
  ].filter(Boolean);

  const ctx = {
    title,
    subtitle: 'Trend and intelligence report',
    range: rangeLabel(startDate, endDate).toUpperCase(),
    generated: format(now, 'MMM d, yyyy').toUpperCase(),
    generatedLong: format(now, 'MMMM d, yyyy'),
    stats,
  };

  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${title} - MergeRSS intelligence report`, creator: 'MergeRSS', author: 'MergeRSS' });

  buildCover(doc, ctx);

  const flow = new Flow(doc, ctx);
  flow.newPage();

  // Range mismatch notice
  const { actual_start: aS, actual_end: aE } = savedReport;
  if (aS && aE && startDate && endDate && (aS !== startDate || aE !== endDate)) {
    warningCard(flow, `Data is available for ${fmt(aS, 'MMM d, yyyy') || aS} to ${fmt(aE, 'MMM d, yyyy') || aE} only. The analysis reflects the briefings available within the requested range.`);
  }

  const outlookText = dedupeOutlook(r.outlook, r.executive_summary);
  const dataCells = [
    briefings ? { label: 'Briefings analysed', value: String(briefings) } : null,
    { label: 'Date range', value: sanitizeText(ds.date_range || '') || rangeLabel(startDate, endDate) },
    ds.most_active_period && !/^n\/?a$/i.test(String(ds.most_active_period).trim()) ? { label: 'Most active period', value: String(ds.most_active_period) } : null,
  ].filter(c => c && String(c.value || '').trim());

  const sections = [
    { label: 'Executive summary', has: hasProse(r.executive_summary), render: () => executiveSummary(flow, r) },
    { label: 'Key themes and evolution', has: themes.length > 0, render: () => keyThemes(flow, themes) },
    { label: 'Trend trajectories', has: nonEmpty(r.escalating_topics) || nonEmpty(r.deescalating_topics) || nonEmpty(r.cyclical_topics), render: () => trajectories(flow, r) },
    { label: 'Inflection points', has: points.length > 0, render: () => timeline(flow, points) },
    { label: 'Outlook and forward signals', has: nonEmpty(outlookText), render: () => outlook(flow, outlookText) },
    { label: 'Data summary', has: !!r.data_summary && dataCells.length > 0, render: () => dataSummary(flow, dataCells) },
  ].filter(sct => sct.has);

  sections.forEach((sct, i) => {
    sectionBand(flow, i + 1, sct.label);
    sct.render();
  });
  if (!sections.length) {
    flow.items(textItems(doc, parseInline('This report has no content for the selected period.'), G.mX, G.col, ST.muted));
  }
  endMark(flow);

  stampFooters(doc, ctx);

  const safeName = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'mergerss';
  const safeDate = startDate ? String(startDate).slice(0, 10) : 'report';
  return { doc, filename: `${safeName}-report-${safeDate}.pdf` };
}

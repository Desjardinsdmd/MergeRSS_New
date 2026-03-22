/**
 * MergeRSS Premium PDF Report
 * ───────────────────────────
 * Architecture: page-template composition system.
 * The report is assembled as a sequence of intentionally-designed page templates.
 * Content flows within templates; templates never flow across pages.
 *
 * Glyph policy: ALL trajectory labels, section markers, and decorative symbols
 * use ASCII-only strings. No Unicode arrows, bullets, or smart punctuation
 * anywhere in rendered text to guarantee clean output across all PDF viewers.
 */

import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

// ─── Geometry & tokens ───────────────────────────────────────────────────────
// US Letter portrait. All measurements in mm.

const G = {
  pageW:   215.9,
  pageH:   279.4,
  mX:      20.0,    // left/right margin (0.79")
  mTop:    18.0,    // top margin on content pages
  mBot:    18.0,    // bottom margin (footer zone)
  get col()      { return this.pageW - this.mX * 2; },         // ~175.9mm
  get bodyH()    { return this.pageH - this.mTop - this.mBot; }, // usable body height
  get bodyBase() { return this.pageH - this.mBot; },             // y of footer line
};

// Print-safe color palette — legible on white paper in all PDF viewers
const C = {
  ink:        [15,  15,  15],
  inkSub:     [50,  50,  50],
  inkMuted:   [100, 100, 100],
  inkFaint:   [155, 155, 155],
  white:      [255, 255, 255],
  amber:      [170, 110,   0],
  amberPale:  [255, 248, 215],
  amberRule:  [190, 140,  15],
  purple:     [ 55,  35, 115],
  purplePale: [238, 235, 250],
  cardBg:     [247, 247, 247],
  cardEdge:   [215, 215, 215],
  rule:       [200, 200, 200],
  // Section-specific tints (print-safe)
  greenPale:  [228, 248, 234],
  greenInk:   [  0, 108,  55],
  redPale:    [252, 228, 228],
  redInk:     [150,  22,  22],
  bluePale:   [225, 235, 255],
  blueInk:    [ 18,  60, 160],
  orangePale: [255, 238, 210],
  orangeInk:  [148,  72,   0],
  grayPale:   [235, 235, 235],
  grayInk:    [ 85,  85,  85],
};

// Typographic line heights (mm) — generous for print readability
const LH = { h1: 8.5, h2: 7.5, body: 6.4, small: 5.2, label: 4.6 };

// ─── ASCII-only trajectory labels ────────────────────────────────────────────
// NO Unicode arrows or symbols — guaranteed safe in Helvetica across all viewers.

const TRAJ = {
  rising:    { label: 'Rising',     fg: C.greenInk,  bg: C.greenPale  },
  falling:   { label: 'Falling',    fg: C.redInk,    bg: C.redPale    },
  stable:    { label: 'Stable',     fg: C.grayInk,   bg: C.grayPale   },
  volatile:  { label: 'Volatile',   fg: C.orangeInk, bg: C.orangePale },
  peaked:    { label: 'Peaked',     fg: C.orangeInk, bg: C.orangePale },
  resolving: { label: 'Resolving',  fg: C.blueInk,   bg: C.bluePale   },
};

// ─── Primitive draw layer ────────────────────────────────────────────────────

const D = {
  font(doc, bold, size) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  },
  rgb(doc, arr)  { doc.setTextColor(...arr); },
  fill(doc, x, y, w, h, arr) { doc.setFillColor(...arr); doc.rect(x, y, w, h, 'F'); },
  stroke(doc, x, y, w, h, arr, lw = 0.3) {
    doc.setDrawColor(...arr); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S');
  },
  line(doc, x1, y1, x2, y2, arr, lw = 0.3) {
    doc.setDrawColor(...arr); doc.setLineWidth(lw); doc.line(x1, y1, x2, y2);
  },
  dot(doc, x, y, r, arr) { doc.setFillColor(...arr); doc.circle(x, y, r, 'F'); },

  // Render wrapped text, return new Y after last line
  para(doc, str, x, y, { size = 9.5, rgb = C.ink, bold = false, maxW = G.col, lh } = {}) {
    this.font(doc, bold, size);
    this.rgb(doc, rgb);
    const lineH = lh || LH.body;
    for (const l of doc.splitTextToSize(String(str || ''), maxW)) {
      doc.text(l, x, y);
      y += lineH;
    }
    return y;
  },

  // Measure wrapped lines array (no render)
  split(doc, str, maxW, bold = false, size = 9.5) {
    this.font(doc, bold, size);
    return doc.splitTextToSize(String(str || ''), maxW);
  },

  // Total height of a wrapped text block
  blockH(doc, str, maxW, bold, size, lh) {
    return this.split(doc, str, maxW, bold, size).length * (lh || LH.body);
  },
};

// ─── Page & footer ───────────────────────────────────────────────────────────

function makeState(digestName, reportDate) {
  return { page: 1, digestName, reportDate };
}

function stampFooter(doc, state) {
  const fy = G.pageH - 6;
  D.line(doc, G.mX, G.pageH - 12, G.pageW - G.mX, G.pageH - 12, C.rule, 0.4);
  D.font(doc, false, 6.5); D.rgb(doc, C.inkFaint);
  doc.text('MergeRSS Intelligence Report', G.mX, fy);
  if (state.reportDate) doc.text(state.reportDate, G.pageW / 2, fy, { align: 'center' });
  doc.text(String(state.page), G.pageW - G.mX, fy, { align: 'right' });
}

function openPage(doc, state) {
  D.fill(doc, 0, 0, G.pageW, G.pageH, C.white);
  stampFooter(doc, state);
}

function nextPage(doc, state) {
  doc.addPage();
  state.page++;
  openPage(doc, state);
  return G.mTop;
}

// ─── Section header ───────────────────────────────────────────────────────────
// Full-bleed tinted bar with number pip + label. Returns Y after bar+gap.

function sectionBar(doc, y, num, title, cont = false) {
  const barH = 10;
  const label = cont ? `${title} (cont.)` : title;
  D.fill(doc, 0, y, G.pageW, barH, C.purplePale);
  D.line(doc, 0, y + barH, G.pageW, y + barH, [195, 190, 218], 0.5);
  D.font(doc, true, 7); D.rgb(doc, C.purple);
  doc.text(num, G.mX, y + barH - 2.5);
  D.line(doc, G.mX + 9, y + 3, G.mX + 9, y + barH - 2.5, [178, 172, 210], 0.4);
  D.font(doc, true, 7); D.rgb(doc, C.inkSub);
  doc.text(label, G.mX + 13, y + barH - 2.5);
  return y + barH + 6;
}

function hRule(doc, y) {
  D.line(doc, G.mX, y, G.mX + G.col, y, C.rule, 0.4);
  return y + 7;
}

// ─── CONTENT PARSERS ─────────────────────────────────────────────────────────
// Structured parsing happens here before any height measurement or rendering.

/**
 * Parse the outlook text into { intro: string|null, signals: string[] }.
 *
 * Strategy:
 * 1. Try to detect numbered items (lines starting with 1. 2. 3. or First, Second, etc.)
 * 2. If found, first non-numbered block = intro, rest = signals
 * 3. If not found, split on double-newline; first block = intro, rest = signals
 * 4. Never split a signal by sentence punctuation
 */
function parseOutlook(rawOutlook) {
  if (!rawOutlook || !rawOutlook.trim()) return { intro: null, signals: [] };

  const text = rawOutlook.trim();

  // Try numbered list detection: lines starting with digit+period or ordinal words
  const numberedPattern = /^(\d+[.)]\s|First[,:]?\s|Second[,:]?\s|Third[,:]?\s|Fourth[,:]?\s|Fifth[,:]?\s|Sixth[,:]?\s|Finally[,:]?\s)/im;
  const lines = text.split(/\r?\n/);

  // Find where numbered items start
  let numberedStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (numberedPattern.test(lines[i].trim())) { numberedStart = i; break; }
  }

  if (numberedStart > 0) {
    // Everything before the first numbered line = intro paragraph
    const intro = lines.slice(0, numberedStart).join(' ').trim() || null;
    // Group numbered lines into signal blocks (accumulate until next numbered line)
    const signalLines = lines.slice(numberedStart);
    const signals = [];
    let current = [];
    for (const line of signalLines) {
      if (numberedPattern.test(line.trim()) && current.length > 0) {
        signals.push(current.join(' ').trim());
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) signals.push(current.join(' ').trim());
    return { intro, signals: signals.filter(s => s.length > 4) };
  }

  if (numberedStart === 0) {
    // All numbered — no intro
    const signals = [];
    let current = [];
    for (const line of lines) {
      if (numberedPattern.test(line.trim()) && current.length > 0) {
        signals.push(current.join(' ').trim());
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) signals.push(current.join(' ').trim());
    return { intro: null, signals: signals.filter(s => s.length > 4) };
  }

  // No numbered structure — split on paragraph breaks
  const paras = text.split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(p => p.length > 4);
  if (paras.length <= 1) {
    // Single block — treat whole thing as intro, no numbered signals
    return { intro: paras[0] || null, signals: [] };
  }
  return { intro: paras[0], signals: paras.slice(1) };
}

// ─── HEIGHT MEASUREMENT ───────────────────────────────────────────────────────
// Every block type has a matching measure function.
// Render functions use identical parameters to guarantee plan accuracy.

const THEME_TITLE_W = G.col - 55;
const THEME_DESC_W  = G.col - 10;
const INF_TEXT_W    = G.col - 22;
const SIG_TEXT_W    = G.col - 20;

function mKeyTakeaway(doc, summary) {
  const first = summary.split(/\.\s+/)[0] || summary.slice(0, 400);
  return D.split(doc, first, G.col - 14, false, 10.5).length * LH.body + 22;
}

function mTheme(doc, t) {
  const tH = D.split(doc, t.theme || '', THEME_TITLE_W, true, 11.5).length * LH.h2;
  const dH = D.split(doc, t.description || '', THEME_DESC_W, false, 9.5).length * LH.body;
  return tH + dH + 26;
}

function mInflection(doc, pt) {
  const eH = D.split(doc, pt.event || '', INF_TEXT_W, true, 11).length * LH.h2;
  const sH = D.split(doc, pt.significance || '', INF_TEXT_W, false, 9.5).length * LH.body;
  return eH + sH + 22;
}

function mSignal(doc, sig) {
  return Math.max(D.split(doc, sig.trim(), SIG_TEXT_W, false, 10).length * LH.body, 8) + 12;
}

function mTraj(doc, r) {
  const cols = [r.escalating_topics || [], r.deescalating_topics || [], r.cyclical_topics || []].filter(c => c.length > 0);
  if (!cols.length) return 0;
  const gutter = 5;
  const colW = Math.floor((G.col - gutter * (cols.length - 1)) / cols.length);
  let maxH = 14;
  for (const items of cols) {
    let h = 14;
    for (const item of items) h += D.split(doc, item, colW - 12, false, 9).length * LH.small + 3;
    h += 10;
    if (h > maxH) maxH = h;
  }
  return maxH;
}

// Elastic data summary: measure actual row heights for each stat
function mDataSummaryRows(doc, ds, deliveryCount, startDate, endDate) {
  const stats = buildDataStats(ds, deliveryCount, startDate, endDate);
  const ROW_LABEL_H = LH.label + 3;
  const ROW_PAD = 8;
  return stats.map(s => ({
    ...s,
    h: ROW_LABEL_H + D.split(doc, s.val, G.col - 16, true, 11).length * LH.h2 + ROW_PAD,
  }));
}

function buildDataStats(ds, deliveryCount, startDate, endDate) {
  return [
    { label: 'ISSUES ANALYZED', val: String(ds.digest_count || deliveryCount || 'N/A') },
    { label: 'DATE RANGE',      val: ds.date_range || [startDate, endDate].filter(Boolean).join(' to ') || 'N/A' },
    { label: 'MOST ACTIVE PERIOD', val: ds.most_active_period || 'N/A' },
  ];
}

// ─── PAGE TEMPLATE PLANNER ────────────────────────────────────────────────────
/**
 * Produces a sequence of PageTemplates. Each template maps to exactly one
 * physical page. Templates are explicit, not discovered by overflow detection.
 *
 * Template shape: { items: Array<{ type, ...data, h }> }
 *
 * The render pass iterates templates one-to-one with pages.
 */

function buildPageTemplates(doc, r, mismatchMsg, deliveryCount, startDate, endDate) {
  const templates = [];
  const USABLE = G.bodyH;  // mm available per content page
  const BAR_H  = 16;       // section bar + gap
  const RULE_H = 7;

  function tpl() { const t = { items: [], usedH: 0 }; templates.push(t); return t; }
  function add(t, item) { t.items.push(item); t.usedH += item.h; }
  function barItem(num, title, cont = false) {
    return { type: 'sectionBar', num, title, cont, h: BAR_H };
  }
  function ruleItem() { return { type: 'rule', h: RULE_H }; }

  // ── TEMPLATE: Executive Summary ───────────────────────────────────────────
  // Always its own page(s). Key takeaway is hero element, then body paragraphs.
  {
    let t = tpl();

    if (mismatchMsg) {
      const wh = D.split(doc, mismatchMsg, G.col - 14, false, 8.5).length * LH.small + 16;
      add(t, { type: 'warning', msg: mismatchMsg, h: wh + 6 });
    }

    add(t, barItem('01', 'EXECUTIVE SUMMARY'));

    if (r.executive_summary) {
      const ktH = mKeyTakeaway(doc, r.executive_summary);
      // Key takeaway + large spacer for editorial whitespace
      add(t, { type: 'keyTakeaway', summary: r.executive_summary, h: ktH + 8 });
      add(t, { type: 'spacer', h: 6 });

      const paras = r.executive_summary.split(/\n+/).map(p => p.trim()).filter(Boolean);
      for (const para of paras) {
        const h = D.split(doc, para, G.col, false, 9.5).length * LH.body + 5;
        if (t.usedH + h > USABLE - 4) t = tpl(); // overflow to next page
        add(t, { type: 'para', text: para, h });
      }
    }
  }

  // ── TEMPLATE: Key Themes ──────────────────────────────────────────────────
  // Max 2 per page for visual breathing room. Intentional, not overflow-driven.
  if (r.key_themes?.length > 0) {
    const MAX_PER_PAGE = 2;
    let t = tpl();
    let countOnPage = 0;

    for (let i = 0; i < r.key_themes.length; i++) {
      const theme = r.key_themes[i];
      const h = mTheme(doc, theme) + 5;
      const isCont = countOnPage === 0 && templates.indexOf(t) > 0;

      if (countOnPage === 0) {
        add(t, barItem('02', 'KEY THEMES AND EVOLUTION', isCont));
      }

      // Start new page if over per-page limit OR no space
      if (countOnPage >= MAX_PER_PAGE || t.usedH + h > USABLE - 4) {
        t = tpl();
        add(t, barItem('02', 'KEY THEMES AND EVOLUTION', true));
        countOnPage = 0;
      }

      add(t, { type: 'theme', theme, index: i, h });
      countOnPage++;
    }
  }

  // ── TEMPLATE: Trend Trajectories ─────────────────────────────────────────
  // Always its own page — rendered as one complete designed block.
  if (r.escalating_topics?.length || r.deescalating_topics?.length || r.cyclical_topics?.length) {
    const t = tpl();
    add(t, barItem('03', 'TREND TRAJECTORIES'));
    add(t, { type: 'spacer', h: 4 });
    const trajH = mTraj(doc, r);
    add(t, { type: 'trajectories', report: r, h: trajH });
  }

  // ── TEMPLATE: Inflection Points ───────────────────────────────────────────
  // Group entries 3–4 per page to maintain timeline readability.
  if (r.inflection_points?.length > 0) {
    const pts = r.inflection_points;
    const MAX_PER_PAGE = 4;
    let t = tpl();
    let countOnPage = 0;

    for (let i = 0; i < pts.length; i++) {
      const h = mInflection(doc, pts[i]) + 5;
      const isLast = i === pts.length - 1;

      if (countOnPage === 0) {
        add(t, barItem('04', 'INFLECTION POINTS', countOnPage === 0 && templates.indexOf(t) > (r.key_themes ? 1 : 0)));
        add(t, { type: 'spacer', h: 4 });
      }

      if (countOnPage >= MAX_PER_PAGE || t.usedH + h > USABLE - 4) {
        t = tpl();
        add(t, barItem('04', 'INFLECTION POINTS', true));
        add(t, { type: 'spacer', h: 4 });
        countOnPage = 0;
      }

      add(t, { type: 'inflection', pt: pts[i], isLast, index: i, h });
      countOnPage++;
    }
  }

  // ── TEMPLATE: Outlook ─────────────────────────────────────────────────────
  // Parsed into intro + intact signal blocks. No sentence-splitting.
  if (r.outlook) {
    const { intro, signals } = parseOutlook(r.outlook);
    const MAX_SIGS_PER_PAGE = 5;

    let t = tpl();
    add(t, barItem('05', 'OUTLOOK AND FORWARD SIGNALS'));
    add(t, { type: 'spacer', h: 4 });

    // Intro paragraph — rendered as body text, not a numbered signal
    if (intro) {
      const h = D.split(doc, intro, G.col, false, 9.5).length * LH.body + 8;
      add(t, { type: 'outlookIntro', text: intro, h });
      add(t, { type: 'spacer', h: 4 });
    }

    let sigsOnPage = 0;
    for (let i = 0; i < signals.length; i++) {
      const h = mSignal(doc, signals[i]);

      if (sigsOnPage >= MAX_SIGS_PER_PAGE || t.usedH + h > USABLE - 4) {
        t = tpl();
        add(t, barItem('05', 'OUTLOOK AND FORWARD SIGNALS', true));
        add(t, { type: 'spacer', h: 4 });
        sigsOnPage = 0;
      }

      add(t, { type: 'signal', signal: signals[i], index: i, h });
      sigsOnPage++;
    }
  }

  // ── TEMPLATE: Data Summary ────────────────────────────────────────────────
  // Own page. Elastic rows — no fixed panel height, no clipping.
  if (r.data_summary) {
    const t = tpl();
    add(t, barItem('06', 'DATA SUMMARY'));
    add(t, { type: 'spacer', h: 6 });
    const rows = mDataSummaryRows(doc, r.data_summary, deliveryCount, startDate, endDate);
    add(t, { type: 'dataSummary', rows, h: rows.reduce((s, r) => s + r.h, 0) + rows.length * 2 });
  }

  return templates;
}

// ─── BLOCK RENDERERS ─────────────────────────────────────────────────────────
// Each renderer draws one block at y and returns new Y. Uses identical
// font/size params as corresponding measure functions.

function rKeyTakeaway(doc, y, summary) {
  const first = summary.split(/\.\s+/)[0] || summary.slice(0, 400);
  const innerW = G.col - 14;
  const lines = D.split(doc, first, innerW, false, 10.5);
  const h = lines.length * LH.body + 22;

  D.fill(doc, G.mX, y, G.col, h, C.amberPale);
  D.fill(doc, G.mX, y, 3.5, h, C.amber);
  D.stroke(doc, G.mX, y, G.col, h, C.amberRule, 0.3);

  D.font(doc, true, 7); D.rgb(doc, C.amber);
  doc.text('KEY TAKEAWAY', G.mX + 9, y + 8);

  D.font(doc, false, 10.5); D.rgb(doc, C.ink);
  lines.forEach((l, i) => doc.text(l, G.mX + 9, y + 15.5 + i * LH.body));
  return y + h + 8;
}

function rWarningBanner(doc, y, msg) {
  const lines = D.split(doc, msg, G.col - 14, false, 8.5);
  const h = lines.length * LH.small + 16;
  D.fill(doc, G.mX, y, G.col, h, [255, 248, 215]);
  D.fill(doc, G.mX, y, 3, h, C.amber);
  D.stroke(doc, G.mX, y, G.col, h, C.amberRule, 0.3);
  D.font(doc, false, 8.5); D.rgb(doc, [125, 75, 0]);
  lines.forEach((l, i) => doc.text(l, G.mX + 10, y + 9 + i * LH.small));
  return y + h + 6;
}

function rTheme(doc, y, theme, index) {
  const num = String(index + 1).padStart(2, '0');
  const titleLines = D.split(doc, theme.theme || '', THEME_TITLE_W, true, 11.5);
  const descLines  = D.split(doc, theme.description || '', THEME_DESC_W, false, 9.5);
  const titleH = titleLines.length * LH.h2;
  const descH  = descLines.length * LH.body;
  const blockH = titleH + descH + 26;

  // Card chrome
  D.fill(doc, G.mX, y, G.col, 2, C.amber);
  D.fill(doc, G.mX, y + 2, G.col, blockH - 2, C.cardBg);
  D.stroke(doc, G.mX, y, G.col, blockH, C.cardEdge, 0.25);

  // Number
  D.font(doc, true, 9); D.rgb(doc, C.purple);
  doc.text(num, G.mX + 5, y + 12);

  // Title
  D.font(doc, true, 11.5); D.rgb(doc, C.ink);
  titleLines.forEach((l, i) => doc.text(l, G.mX + 15, y + 12 + i * LH.h2));

  // Trajectory pill — text-only label (no symbol), right-aligned in title row
  const cfg = TRAJ[theme.trajectory] || TRAJ.stable;
  D.font(doc, true, 7);
  const pillW = doc.getTextWidth(cfg.label) + 9;
  const pillX = G.mX + G.col - pillW - 4;
  D.fill(doc, pillX, y + 5, pillW, 7.5, cfg.bg);
  D.rgb(doc, cfg.fg);
  doc.text(cfg.label, pillX + 4.5, y + 11);

  // Description
  const descY = y + titleH + 18;
  D.font(doc, false, 9.5); D.rgb(doc, C.inkSub);
  descLines.forEach((l, i) => doc.text(l, G.mX + 15, descY + i * LH.body));

  return y + blockH + 5;
}

function rTrajectories(doc, y, r) {
  const defs = [
    { items: r.escalating_topics   || [], label: 'ESCALATING',    fg: C.greenInk,  hBg: [210, 245, 222], bBg: [234, 250, 240] },
    { items: r.deescalating_topics || [], label: 'DE-ESCALATING', fg: C.blueInk,   hBg: [210, 226, 255], bBg: [230, 240, 255] },
    { items: r.cyclical_topics     || [], label: 'CYCLICAL',       fg: C.orangeInk, hBg: [255, 236, 202], bBg: [255, 246, 228] },
  ];
  const active = defs.filter(c => c.items.length > 0);
  if (!active.length) return y;

  const gutter = 6;
  const colW = Math.floor((G.col - gutter * (active.length - 1)) / active.length);

  // Measure tallest column
  let maxH = 14;
  for (const col of active) {
    let h = 14;
    for (const item of col.items) h += D.split(doc, item, colW - 12, false, 9).length * LH.small + 3;
    h += 10;
    if (h > maxH) maxH = h;
  }

  active.forEach((col, ci) => {
    const x = G.mX + ci * (colW + gutter);
    D.fill(doc, x, y, colW, 14, col.hBg);
    D.fill(doc, x, y + 14, colW, maxH - 14, col.bBg);
    D.stroke(doc, x, y, colW, maxH, C.cardEdge, 0.3);

    // Column heading — ASCII label only, no arrows
    D.font(doc, true, 7.5); D.rgb(doc, col.fg);
    doc.text(col.label, x + 5, y + 10);

    D.font(doc, false, 9); D.rgb(doc, C.ink);
    let iy = y + 23;
    for (const item of col.items) {
      const ls = D.split(doc, item, colW - 12, false, 9);
      // Use a simple dash prefix (ASCII-safe) instead of bullet
      const prefix = '- ';
      const pls = D.split(doc, prefix + item, colW - 12, false, 9);
      for (const l of pls) {
        if (iy < y + maxH - 3) { doc.text(l, x + 5, iy); iy += LH.small; }
      }
      iy += 2.5;
    }
  });

  return y + maxH + 8;
}

function rInflection(doc, y, pt, isLast) {
  const evLines  = D.split(doc, pt.event || '', INF_TEXT_W, true, 11);
  const sigLines = D.split(doc, pt.significance || '', INF_TEXT_W, false, 9.5);
  const entryH   = evLines.length * LH.h2 + sigLines.length * LH.body + 22;

  const dotX = G.mX + 6;
  D.dot(doc, dotX, y + 5.5, 3, C.amber);
  if (!isLast) D.line(doc, dotX, y + 9, dotX, y + entryH + 5, C.rule, 0.6);

  const tx = G.mX + 17;

  // Date label
  D.font(doc, true, 7); D.rgb(doc, C.amber);
  doc.text((pt.date || '').toUpperCase(), tx, y + 7);

  // Event headline
  D.font(doc, true, 11); D.rgb(doc, C.ink);
  evLines.forEach((l, i) => doc.text(l, tx, y + 14 + i * LH.h2));

  // Significance
  const sigY = y + 14 + evLines.length * LH.h2 + 2;
  D.font(doc, false, 9.5); D.rgb(doc, C.inkSub);
  sigLines.forEach((l, i) => doc.text(l, tx, sigY + i * LH.body));

  return y + entryH + 5;
}

function rOutlookIntro(doc, y, text) {
  // Rendered as a pull-quote / lead paragraph — slightly larger, muted
  D.fill(doc, G.mX, y, G.col, 2, C.rule);
  D.font(doc, false, 9.5); D.rgb(doc, C.inkSub);
  const lines = D.split(doc, text, G.col, false, 9.5);
  lines.forEach((l, i) => doc.text(l, G.mX, y + 8 + i * LH.body));
  return y + lines.length * LH.body + 12;
}

function rSignal(doc, y, signal, index) {
  const lines = D.split(doc, signal.trim(), SIG_TEXT_W, false, 10);
  const blockH = Math.max(lines.length * LH.body, 9) + 12;

  // Number badge — square, no border glyph issues
  D.fill(doc, G.mX, y, 9, 9, C.purplePale);
  D.stroke(doc, G.mX, y, 9, 9, [175, 170, 210], 0.35);
  D.font(doc, true, 7.5); D.rgb(doc, C.purple);
  doc.text(String(index + 1), G.mX + 2.5, y + 6.5);

  D.font(doc, false, 10); D.rgb(doc, C.ink);
  lines.forEach((l, i) => doc.text(l, G.mX + 14, y + 6.5 + i * LH.body));
  return y + blockH + 2;
}

// Elastic data summary — stacked rows, no fixed cell width, no clipping
function rDataSummary(doc, y, rows) {
  let ry = y;
  for (const row of rows) {
    const valLines = D.split(doc, row.val, G.col - 16, true, 11);
    const rowH = LH.label + 3 + valLines.length * LH.h2 + 8;

    D.fill(doc, G.mX, ry, G.col, rowH, C.cardBg);
    D.stroke(doc, G.mX, ry, G.col, rowH, C.cardEdge, 0.25);
    // Amber left accent
    D.fill(doc, G.mX, ry, 3, rowH, C.amber);

    D.font(doc, false, 7); D.rgb(doc, C.inkFaint);
    doc.text(row.label, G.mX + 8, ry + 7);

    D.font(doc, true, 11); D.rgb(doc, C.ink);
    valLines.forEach((l, i) => doc.text(l, G.mX + 8, ry + 13 + i * LH.h2));

    ry += rowH + 3;
  }
  return ry;
}

// ─── COVER PAGE ───────────────────────────────────────────────────────────────

function buildCover(doc, digestName, startDate, endDate, deliveryCount) {
  D.fill(doc, 0, 0, G.pageW, G.pageH, C.white);

  // Top accent stripe
  D.fill(doc, 0, 0, G.pageW, 4, C.amber);

  // Wordmark
  D.fill(doc, G.mX, 17, 13, 13, C.amber);
  D.font(doc, true, 9); D.rgb(doc, C.white);
  doc.text('M', G.mX + 4, 26.5);
  D.font(doc, true, 10.5); D.rgb(doc, C.ink);
  doc.text('MergeRSS', G.mX + 18, 26.5);

  D.font(doc, false, 7); D.rgb(doc, C.inkMuted);
  doc.text('INTELLIGENCE REPORT', G.mX, 50);
  D.line(doc, G.mX, 54, G.mX + G.col, 54, C.rule, 0.7);

  // Report title
  D.font(doc, true, 27); D.rgb(doc, C.ink);
  const tl = doc.splitTextToSize(digestName, G.col);
  let ty = 69;
  tl.slice(0, 4).forEach(l => { doc.text(l, G.mX, ty); ty += 13; });

  D.font(doc, false, 12); D.rgb(doc, C.amber);
  doc.text('Trend and Intelligence Report', G.mX, ty + 5);

  let dateStr = '';
  try { dateStr = `${format(new Date(startDate), 'MMMM d, yyyy')} to ${format(new Date(endDate), 'MMMM d, yyyy')}`; }
  catch { dateStr = [startDate, endDate].filter(Boolean).join(' to '); }
  D.font(doc, false, 9.5); D.rgb(doc, C.inkMuted);
  doc.text(dateStr, G.mX, ty + 17);

  // Stats band
  const sY = ty + 34;
  D.line(doc, G.mX, sY, G.mX + G.col, sY, C.rule, 0.5);
  D.font(doc, true, 30); D.rgb(doc, C.amber);
  doc.text(String(deliveryCount), G.mX, sY + 18);
  D.font(doc, false, 8); D.rgb(doc, C.inkMuted);
  doc.text('DIGEST ISSUES ANALYZED', G.mX + 24, sY + 18);
  D.line(doc, G.mX, sY + 24, G.mX + G.col, sY + 24, C.rule, 0.5);

  // Metadata card
  const mY = sY + 34;
  D.fill(doc, G.mX, mY, G.col, 32, C.cardBg);
  D.stroke(doc, G.mX, mY, G.col, 32, C.cardEdge, 0.3);
  D.font(doc, false, 7); D.rgb(doc, C.inkFaint);
  doc.text('PREPARED BY', G.mX + 7, mY + 8);
  D.font(doc, true, 10); D.rgb(doc, C.ink);
  doc.text('MergeRSS Intelligence Engine', G.mX + 7, mY + 16);
  D.font(doc, false, 7); D.rgb(doc, C.inkFaint);
  doc.text('GENERATED', G.mX + 95, mY + 8);
  D.font(doc, true, 10); D.rgb(doc, C.ink);
  doc.text(format(new Date(), 'MMMM d, yyyy'), G.mX + 95, mY + 16);

  // Disclaimer
  const dY = mY + 42;
  D.font(doc, false, 7.5); D.rgb(doc, C.inkFaint);
  const disc = 'This report was generated by an AI-powered analysis engine from curated digest data. Content is for informational purposes only and reflects data available within the specified date range.';
  doc.splitTextToSize(disc, G.col).forEach((l, i) => doc.text(l, G.mX, dY + i * 4.7));

  // Cover footer
  D.line(doc, G.mX, G.pageH - 17, G.mX + G.col, G.pageH - 17, C.rule, 0.4);
  D.font(doc, false, 7); D.rgb(doc, C.inkFaint);
  doc.text('CONFIDENTIAL', G.mX, G.pageH - 9);
  doc.text('mergerss.com', G.pageW - G.mX, G.pageH - 9, { align: 'right' });
}

function buildBackPage(doc, state) {
  nextPage(doc, state);
  const cx = G.pageW / 2, cy = G.pageH / 2 - 12;
  D.fill(doc, cx - 13, cy - 13, 26, 26, C.amber);
  D.font(doc, true, 15); D.rgb(doc, C.white);
  doc.text('M', cx - 4.5, cy + 5);
  D.font(doc, true, 19); D.rgb(doc, C.ink);
  doc.text('MergeRSS', cx, cy + 24, { align: 'center' });
  D.font(doc, false, 10); D.rgb(doc, C.inkMuted);
  doc.text('Intelligence. Curated.', cx, cy + 33, { align: 'center' });
  D.line(doc, cx - 36, cy + 40, cx + 36, cy + 40, C.rule, 0.4);
  D.font(doc, false, 8.5); D.rgb(doc, C.inkFaint);
  doc.text('mergerss.com', cx, cy + 48, { align: 'center' });
}

// ─── RENDER PASS ─────────────────────────────────────────────────────────────
// One template = one page. No overflow logic here — the planner handles that.

function renderTemplates(doc, templates, state, ctx) {
  const { deliveryCount, startDate, endDate } = ctx;
  let firstPage = true;

  for (const tpl of templates) {
    if (firstPage) {
      doc.addPage(); state.page = 2; openPage(doc, state); firstPage = false;
    } else {
      nextPage(doc, state);
    }

    let y = G.mTop;

    for (const item of tpl.items) {
      switch (item.type) {
        case 'sectionBar':
          y = sectionBar(doc, y, item.num, item.title, item.cont);
          break;
        case 'warning':
          y = rWarningBanner(doc, y, item.msg);
          break;
        case 'keyTakeaway':
          y = rKeyTakeaway(doc, y, item.summary);
          break;
        case 'para':
          y = D.para(doc, item.text, G.mX, y, { size: 9.5, rgb: C.inkSub, lh: LH.body });
          y += 5;
          break;
        case 'outlookIntro':
          y = rOutlookIntro(doc, y, item.text);
          break;
        case 'theme':
          y = rTheme(doc, y, item.theme, item.index);
          break;
        case 'trajectories':
          y = rTrajectories(doc, y, item.report);
          break;
        case 'inflection':
          y = rInflection(doc, y, item.pt, item.isLast);
          break;
        case 'signal':
          y = rSignal(doc, y, item.signal, item.index);
          break;
        case 'dataSummary':
          y = rDataSummary(doc, y, item.rows);
          break;
        case 'rule':
          y = hRule(doc, y);
          break;
        case 'spacer':
          y += item.h;
          break;
      }
    }
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export async function generatePremiumPdf(savedReport) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });

  const r             = savedReport.report || {};
  const digestName    = savedReport.digest_name || 'Intelligence Report';
  const startDate     = savedReport.start_date || '';
  const endDate       = savedReport.end_date || '';
  const deliveryCount = savedReport.delivery_count || 0;
  const actualStart   = savedReport.actual_start;
  const actualEnd     = savedReport.actual_end;

  let reportDateStr = '';
  try { reportDateStr = format(new Date(), 'MMMM d, yyyy'); } catch {}

  const state = makeState(digestName, reportDateStr);

  // Mismatch banner message
  let mismatchMsg = '';
  const hasMismatch = actualStart && actualEnd && startDate && endDate &&
    (actualStart !== startDate || actualEnd !== endDate);
  if (hasMismatch) {
    let ds = actualStart, de = actualEnd;
    try { ds = format(new Date(actualStart), 'MMM d, yyyy'); } catch {}
    try { de = format(new Date(actualEnd), 'MMM d, yyyy'); } catch {}
    mismatchMsg = `Note: Data is available for ${ds} to ${de} only. Analysis reflects available issues within the requested range.`;
  }

  // Phase 1: Cover
  buildCover(doc, digestName, startDate, endDate, deliveryCount);

  // Phase 2: Build page templates (measurement + planning, no rendering)
  const templates = buildPageTemplates(doc, r, mismatchMsg, deliveryCount, startDate, endDate);

  // Phase 3: Render templates page by page
  renderTemplates(doc, templates, state, { r, deliveryCount, startDate, endDate });

  // Back page
  buildBackPage(doc, state);

  // Save
  const safeName = digestName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const safeDate = startDate ? startDate.slice(0, 10) : 'report';
  doc.save(`${safeName}-report-${safeDate}.pdf`);
}
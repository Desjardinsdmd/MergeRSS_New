import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

// ─── Page geometry & design tokens ───────────────────────────────────────────
// US Letter, portrait. All units mm. 1" = 25.4mm.

const P = {
  pageW:      215.9,
  pageH:      279.4,
  marginX:    19.05,   // 0.75" side margins
  marginY:    19.05,   // top margin on content pages
  footerH:    13,      // reserved at bottom for footer
  get col()        { return this.pageW - this.marginX * 2; },     // 177.8mm
  get usableH()    { return this.pageH - this.marginY - this.footerH; }, // ~247mm per page
  get bodyBottom() { return this.pageH - this.footerH; },

  // Brand
  amber:       [175, 115, 0],
  amberLight:  [255, 248, 220],
  amberBorder: [195, 145, 18],
  accent:      [58, 38, 118],
  accentLight: [240, 237, 250],

  // Text
  ink:         [18, 18, 18],
  inkSub:      [55, 55, 55],
  inkMuted:    [105, 105, 105],
  inkFaint:    [158, 158, 158],

  // Surfaces
  white:       [255, 255, 255],
  cardBg:      [248, 248, 248],
  cardBorder:  [218, 218, 218],
  ruleColor:   [205, 205, 205],
};

// Typographic line heights (mm)
const LH = { body: 6.2, small: 5.0, label: 4.5, large: 7.0 };

// Section layout constraints
const LAYOUT = {
  THEMES_PER_PAGE:  3,   // max theme blocks per page
  SIGNALS_PER_PAGE: 6,   // max outlook signals per page
  SECTION_HEADER_H: 15,  // header bar + gap below
  MIN_ORPHAN_H:     30,  // min usable space required to start a section on a page
};

// Trajectory config — print-safe palette
const TRAJ = {
  rising:    { label: 'Rising \u2191',    fg: [0, 115, 65],   bg: [225, 248, 234] },
  falling:   { label: 'Falling \u2193',   fg: [155, 25, 25],  bg: [252, 228, 228] },
  stable:    { label: 'Stable \u2192',    fg: [88, 88, 88],   bg: [236, 236, 236] },
  volatile:  { label: 'Volatile',         fg: [155, 75, 0],   bg: [255, 236, 208] },
  peaked:    { label: 'Peaked',           fg: [155, 75, 0],   bg: [255, 236, 208] },
  resolving: { label: 'Resolving \u2198', fg: [18, 65, 165],  bg: [222, 232, 255] },
};

// ─── Primitive draw helpers ───────────────────────────────────────────────────

const D = {
  font(doc, bold, size)         { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); },
  color(doc, rgb)               { doc.setTextColor(...rgb); },
  fill(doc, x, y, w, h, rgb)   { doc.setFillColor(...rgb); doc.rect(x, y, w, h, 'F'); },
  stroke(doc, x, y, w, h, rgb, lw = 0.3) { doc.setDrawColor(...rgb); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S'); },
  line(doc, x1, y1, x2, y2, rgb, lw = 0.3) { doc.setDrawColor(...rgb); doc.setLineWidth(lw); doc.line(x1, y1, x2, y2); },
  circle(doc, x, y, r, rgb)    { doc.setFillColor(...rgb); doc.circle(x, y, r, 'F'); },

  // Render wrapped text, return new Y
  text(doc, str, x, y, { size = 9.5, rgb = P.ink, bold = false, maxW = P.col, lh, align = 'left' } = {}) {
    this.font(doc, bold, size);
    this.color(doc, rgb);
    const lineH = lh || LH.body;
    for (const l of doc.splitTextToSize(String(str || ''), maxW)) {
      doc.text(l, x, y, { align });
      y += lineH;
    }
    return y;
  },

  // Measure wrapped lines (no render)
  lines(doc, str, maxW, bold = false, size = 9.5) {
    this.font(doc, bold, size);
    return doc.splitTextToSize(String(str || ''), maxW);
  },

  // Measure total height of wrapped text block
  textH(doc, str, maxW, bold, size, lh) {
    return this.lines(doc, str, maxW, bold, size).length * (lh || LH.body);
  },
};

// ─── Page state ───────────────────────────────────────────────────────────────

function makeState(digestName, reportDate) {
  return { page: 1, digestName, reportDate };
}

function initPage(doc, state) {
  D.fill(doc, 0, 0, P.pageW, P.pageH, P.white);
  _drawFooter(doc, state.page, state.digestName, state.reportDate);
}

function breakPage(doc, state) {
  doc.addPage();
  state.page++;
  initPage(doc, state);
  return P.marginY;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function _drawFooter(doc, pageNum, digestName, reportDate) {
  const fy = P.pageH - 5.5;
  D.line(doc, P.marginX, P.pageH - 11, P.pageW - P.marginX, P.pageH - 11, P.ruleColor, 0.4);
  D.font(doc, false, 6.5);
  D.color(doc, P.inkFaint);
  doc.text(`MergeRSS Intelligence Report  \u00B7  ${digestName || ''}`, P.marginX, fy);
  if (reportDate) doc.text(reportDate, P.pageW / 2, fy, { align: 'center' });
  doc.text(String(pageNum), P.pageW - P.marginX, fy, { align: 'right' });
}

// ─── Section header bar ───────────────────────────────────────────────────────

function drawSectionHeader(doc, y, num, label) {
  const barH = 10;
  D.fill(doc, 0, y, P.pageW, barH, P.accentLight);
  D.line(doc, 0, y + barH, P.pageW, y + barH, [198, 193, 220], 0.5);
  D.font(doc, true, 7.5); D.color(doc, P.accent);
  doc.text(num, P.marginX, y + barH - 2.5);
  D.line(doc, P.marginX + 9, y + 2.8, P.marginX + 9, y + barH - 2.5, [178, 172, 210], 0.5);
  D.font(doc, true, 7.5); D.color(doc, P.inkSub);
  doc.text(label, P.marginX + 13, y + barH - 2.5);
  return y + barH + 5;
}

function drawRule(doc, y) {
  D.line(doc, P.marginX, y, P.marginX + P.col, y, P.ruleColor, 0.4);
  return y + 8;
}

// ─── MEASUREMENT PASS ────────────────────────────────────────────────────────
// All height calculations live here. Renderers use these same formulas.
// This ensures the plan exactly matches what gets drawn.

function measureKeyTakeaway(doc, summary) {
  const first = summary.split(/(?<=[.!?])\s+/)[0] || summary.slice(0, 350);
  const lines = D.lines(doc, first, P.col - 14, false, 10);
  return lines.length * LH.body + 18;
}

function measureThemeBlock(doc, theme) {
  const titleH = D.lines(doc, theme.theme || '', P.col - 55, true, 11).length * LH.large;
  const descH  = D.lines(doc, theme.description || '', P.col - 10, false, 9).length * LH.body;
  return titleH + descH + 22;
}

function measureInflectionEntry(doc, pt) {
  const evH  = D.lines(doc, pt.event || '', P.col - 20, true, 10.5).length * LH.large;
  const sigH = D.lines(doc, pt.significance || '', P.col - 20, false, 9).length * LH.body;
  return evH + sigH + 18;
}

function measureSignal(doc, signal) {
  return Math.max(D.lines(doc, signal.trim(), P.col - 16, false, 9.5).length * LH.body, 8) + 8;
}

function measureTrajBlock(doc, r) {
  const colDefs = [
    { items: r.escalating_topics || [] },
    { items: r.deescalating_topics || [] },
    { items: r.cyclical_topics || [] },
  ];
  const active = colDefs.filter(c => c.items.length > 0);
  if (!active.length) return 0;
  const gutter = 5;
  const colW = Math.floor((P.col - gutter * (active.length - 1)) / active.length);
  let maxH = 12;
  for (const col of active) {
    let h = 12;
    for (const item of col.items) {
      h += D.lines(doc, `\u2022  ${item}`, colW - 10, false, 9).length * LH.body + 2;
    }
    h += 8;
    if (h > maxH) maxH = h;
  }
  return maxH;
}

function measureDataSummary() {
  return 34; // fixed panel height
}

// ─── PAGE PLANNER ─────────────────────────────────────────────────────────────
// Builds an ordered list of "page plans" before any rendering happens.
// Each plan is: { forceNewPage, items: [ {type, data, height} ] }
// The renderer iterates plans → pages → items in order.

function planPages(doc, r, hasMismatch) {
  const usable = P.usableH;
  const pages = [];  // array of page plans: { startsSection, items }

  function newPlan() {
    const plan = { items: [], usedH: 0 };
    pages.push(plan);
    return plan;
  }

  function addItem(plan, item) {
    plan.items.push(item);
    plan.usedH += item.h;
  }

  // Helper: start section header — always reserved with content, never alone
  function sectionItem(num, label) {
    return { type: 'sectionHeader', num, label, h: LAYOUT.SECTION_HEADER_H };
  }
  function ruleItem() { return { type: 'rule', h: 8 }; }
  function spacerItem(h) { return { type: 'spacer', h }; }

  let cur = newPlan();

  // ── Range mismatch banner ──
  if (hasMismatch) {
    const h = 20; // approximate banner height
    addItem(cur, { type: 'warning', h });
    cur.usedH += 4;
  }

  // ── 01 Executive Summary ──
  // Always gets a fresh page for top-weighted presentation
  if (cur.usedH > 0) cur = newPlan();  // force new page if anything above

  addItem(cur, sectionItem('01', 'EXECUTIVE SUMMARY'));

  if (r.executive_summary) {
    const ktH = measureKeyTakeaway(doc, r.executive_summary);
    addItem(cur, { type: 'keyTakeaway', summary: r.executive_summary, h: ktH + 6 });

    const paras = r.executive_summary.split(/\n+/).filter(p => p.trim());
    for (const para of paras) {
      const h = D.lines(doc, para, P.col, false, 9.5).length * LH.body + 4;
      if (cur.usedH + h > usable) cur = newPlan();
      addItem(cur, { type: 'para', text: para, h });
    }
  }

  addItem(cur, ruleItem());
  cur.usedH += 3;

  // ── 02 Key Themes ──
  if (r.key_themes?.length > 0) {
    // Themes always start on a new page if remaining space < MIN_ORPHAN_H
    if (cur.usedH > usable - LAYOUT.MIN_ORPHAN_H) cur = newPlan();

    // Decide: how many themes fit on first themes page?
    // We group them into pages of max THEMES_PER_PAGE, but also respect height.
    const themeHeights = r.key_themes.map(t => measureThemeBlock(doc, t) + 4);

    let onFirstPage = true;
    let themesOnCurrentPage = 0;
    let pageThemeH = 0;

    for (let i = 0; i < r.key_themes.length; i++) {
      const h = themeHeights[i];

      // Start new page if: over per-page limit OR not enough space
      const overLimit = themesOnCurrentPage >= LAYOUT.THEMES_PER_PAGE;
      const noSpace   = cur.usedH + h > usable - 4;

      if (overLimit || noSpace) {
        // Check for orphan: if this would be the only item left, pull it to a new page cleanly
        cur = newPlan();
        // Re-add section header if this is a continuation page
        addItem(cur, { type: 'sectionHeader', num: '02', label: 'KEY THEMES & EVOLUTION (CONT.)', h: LAYOUT.SECTION_HEADER_H });
        themesOnCurrentPage = 0;
        pageThemeH = 0;
        onFirstPage = false;
      }

      if (onFirstPage && themesOnCurrentPage === 0) {
        addItem(cur, sectionItem('02', 'KEY THEMES & EVOLUTION'));
      }

      addItem(cur, { type: 'theme', theme: r.key_themes[i], index: i, h });
      themesOnCurrentPage++;
      pageThemeH += h;
    }

    addItem(cur, ruleItem());
    cur.usedH += 3;
  }

  // ── 03 Trend Trajectories ──
  if (r.escalating_topics?.length || r.deescalating_topics?.length || r.cyclical_topics?.length) {
    const trajH = measureTrajBlock(doc, r);
    const needed = LAYOUT.SECTION_HEADER_H + trajH + 12;

    // Trajectories must render as a complete unit — move to new page if needed
    if (cur.usedH + needed > usable) cur = newPlan();

    addItem(cur, sectionItem('03', 'TREND TRAJECTORIES'));
    addItem(cur, { type: 'trajectories', report: r, h: trajH });
    addItem(cur, ruleItem());
    cur.usedH += 3;
  }

  // ── 04 Inflection Points ──
  if (r.inflection_points?.length > 0) {
    const pts = r.inflection_points;
    const ptHeights = pts.map(p => measureInflectionEntry(doc, p) + 4);

    if (cur.usedH > usable - LAYOUT.MIN_ORPHAN_H) cur = newPlan();

    let firstOnSection = true;

    for (let i = 0; i < pts.length; i++) {
      const h = ptHeights[i];
      const isLast = i === pts.length - 1;

      // Avoid orphan: if this is the last item and would be alone on next page
      // and there's one more on current, just push both
      if (cur.usedH + h > usable) {
        cur = newPlan();
        addItem(cur, { type: 'sectionHeader', num: '04', label: 'INFLECTION POINTS (CONT.)', h: LAYOUT.SECTION_HEADER_H });
        firstOnSection = false;
      }

      if (firstOnSection) {
        addItem(cur, sectionItem('04', 'INFLECTION POINTS'));
        cur.usedH += 4;
        firstOnSection = false;
      }

      addItem(cur, { type: 'inflection', pt: pts[i], isLast, index: i, h });
    }

    addItem(cur, ruleItem());
    cur.usedH += 3;
  }

  // ── 05 Outlook & Forward Signals ──
  if (r.outlook) {
    const signals = r.outlook.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 8);
    const sigHeights = signals.map(s => measureSignal(doc, s) + 2);

    if (cur.usedH > usable - LAYOUT.MIN_ORPHAN_H) cur = newPlan();

    let firstOnSection = true;
    let sigsOnPage = 0;

    for (let i = 0; i < signals.length; i++) {
      const h = sigHeights[i];

      const overLimit = sigsOnPage >= LAYOUT.SIGNALS_PER_PAGE;
      const noSpace   = cur.usedH + h > usable - 4;

      if (overLimit || noSpace) {
        cur = newPlan();
        addItem(cur, { type: 'sectionHeader', num: '05', label: 'OUTLOOK & FORWARD SIGNALS (CONT.)', h: LAYOUT.SECTION_HEADER_H });
        firstOnSection = false;
        sigsOnPage = 0;
      }

      if (firstOnSection) {
        addItem(cur, sectionItem('05', 'OUTLOOK & FORWARD SIGNALS'));
        cur.usedH += 4;
        firstOnSection = false;
      }

      addItem(cur, { type: 'signal', signal: signals[i], index: i, h });
      sigsOnPage++;
    }

    addItem(cur, ruleItem());
    cur.usedH += 3;
  }

  // ── 06 Data Summary ──
  if (r.data_summary) {
    const dsH = LAYOUT.SECTION_HEADER_H + measureDataSummary() + 8;
    // Always render as complete block; prefer top of page
    if (cur.usedH + dsH > usable) cur = newPlan();
    addItem(cur, sectionItem('06', 'DATA SUMMARY'));
    addItem(cur, { type: 'dataSummary', data: r.data_summary, h: measureDataSummary() });
  }

  return pages;
}

// ─── RENDER HELPERS ───────────────────────────────────────────────────────────
// Each draws exactly one logical block and returns new Y.

function renderKeyTakeaway(doc, y, summary) {
  const first = summary.split(/(?<=[.!?])\s+/)[0] || summary.slice(0, 350);
  const innerW = P.col - 14;
  const lines = D.lines(doc, first, innerW, false, 10);
  const h = lines.length * LH.body + 18;

  D.fill(doc, P.marginX, y, P.col, h, P.amberLight);
  D.fill(doc, P.marginX, y, 3, h, P.amber);
  D.stroke(doc, P.marginX, y, P.col, h, P.amberBorder, 0.3);
  D.font(doc, true, 7); D.color(doc, P.amber);
  doc.text('KEY TAKEAWAY', P.marginX + 8, y + 7);
  D.font(doc, false, 10); D.color(doc, P.ink);
  lines.forEach((l, i) => doc.text(l, P.marginX + 8, y + 14 + i * LH.body));
  return y + h + 6;
}

function renderWarningBanner(doc, y, msg) {
  const lines = D.lines(doc, msg, P.col - 14, false, 8.5);
  const h = lines.length * LH.small + 12;
  D.fill(doc, P.marginX, y, P.col, h, [255, 248, 218]);
  D.fill(doc, P.marginX, y, 3, h, P.amber);
  D.stroke(doc, P.marginX, y, P.col, h, P.amberBorder, 0.3);
  D.font(doc, false, 8.5); D.color(doc, [128, 78, 0]);
  lines.forEach((l, i) => doc.text(l, P.marginX + 10, y + 8 + i * LH.small));
  return y + h + 5;
}

function renderThemeBlock(doc, y, theme, index) {
  const num = String(index + 1).padStart(2, '0');
  const titleLines = D.lines(doc, theme.theme || '', P.col - 55, true, 11);
  const descLines  = D.lines(doc, theme.description || '', P.col - 10, false, 9);
  const titleH = titleLines.length * LH.large;
  const descH  = descLines.length * LH.body;
  const blockH = titleH + descH + 22;

  D.fill(doc, P.marginX, y, P.col, 1, P.amber);
  D.fill(doc, P.marginX, y + 1, P.col, blockH - 1, P.cardBg);
  D.stroke(doc, P.marginX, y, P.col, blockH, P.cardBorder, 0.25);

  D.font(doc, true, 8); D.color(doc, P.accent);
  doc.text(num, P.marginX + 5, y + 10);

  D.font(doc, true, 11); D.color(doc, P.ink);
  titleLines.forEach((l, i) => doc.text(l, P.marginX + 14, y + 10 + i * LH.large));

  const cfg = TRAJ[theme.trajectory] || TRAJ.stable;
  D.font(doc, true, 7);
  const pillW = doc.getTextWidth(cfg.label) + 8;
  const pillX = P.marginX + P.col - pillW - 4;
  D.fill(doc, pillX, y + 4, pillW, 7, cfg.bg);
  D.color(doc, cfg.fg);
  doc.text(cfg.label, pillX + 4, y + 9.5);

  const descY = y + titleH + 16;
  D.font(doc, false, 9); D.color(doc, P.inkSub);
  descLines.forEach((l, i) => doc.text(l, P.marginX + 14, descY + i * LH.body));

  return y + blockH + 4;
}

function renderTrajectoryColumns(doc, y, r) {
  const colDefs = [
    { items: r.escalating_topics   || [], label: 'ESCALATING \u2191',    fg: [0, 110, 60],  hdrBg: [212, 245, 225], bodyBg: [236, 250, 240] },
    { items: r.deescalating_topics || [], label: 'DE-ESCALATING \u2193', fg: [18, 65, 165], hdrBg: [212, 226, 255], bodyBg: [232, 240, 255] },
    { items: r.cyclical_topics     || [], label: 'CYCLICAL',             fg: [155, 78, 0],  hdrBg: [255, 236, 205], bodyBg: [255, 246, 228] },
  ];
  const active = colDefs.filter(c => c.items.length > 0);
  if (!active.length) return y;

  const gutter = 5;
  const colW = Math.floor((P.col - gutter * (active.length - 1)) / active.length);

  // Compute max column height
  let maxH = 12;
  for (const col of active) {
    let h = 12;
    for (const item of col.items) {
      h += D.lines(doc, `\u2022  ${item}`, colW - 10, false, 9).length * LH.body + 2;
    }
    h += 8;
    if (h > maxH) maxH = h;
  }

  active.forEach((col, ci) => {
    const x = P.marginX + ci * (colW + gutter);
    D.fill(doc, x, y, colW, 12, col.hdrBg);
    D.fill(doc, x, y + 12, colW, maxH - 12, col.bodyBg);
    D.stroke(doc, x, y, colW, maxH, P.cardBorder, 0.3);
    D.font(doc, true, 7.5); D.color(doc, col.fg);
    doc.text(col.label, x + 5, y + 8.5);

    D.font(doc, false, 9); D.color(doc, P.ink);
    let iy = y + 21;
    col.items.forEach(item => {
      const ls = D.lines(doc, `\u2022  ${item}`, colW - 10, false, 9);
      ls.forEach(l => {
        if (iy < y + maxH - 2) { doc.text(l, x + 5, iy); iy += LH.body; }
      });
      iy += 2;
    });
  });

  return y + maxH + 8;
}

function renderInflectionEntry(doc, y, pt, isLast) {
  const evLines  = D.lines(doc, pt.event || '', P.col - 20, true, 10.5);
  const sigLines = D.lines(doc, pt.significance || '', P.col - 20, false, 9);
  const entryH   = evLines.length * LH.large + sigLines.length * LH.body + 18;

  const dotX = P.marginX + 5.5;
  D.circle(doc, dotX, y + 5, 2.8, P.amber);
  if (!isLast) D.line(doc, dotX, y + 8, dotX, y + entryH + 4, P.ruleColor, 0.6);

  const textX = P.marginX + 16;
  D.font(doc, true, 7.5); D.color(doc, P.amber);
  doc.text((pt.date || '').toUpperCase(), textX, y + 6);

  D.font(doc, true, 10.5); D.color(doc, P.ink);
  evLines.forEach((l, i) => doc.text(l, textX, y + 13 + i * LH.large));

  const sigY = y + 13 + evLines.length * LH.large + 2;
  D.font(doc, false, 9); D.color(doc, P.inkSub);
  sigLines.forEach((l, i) => doc.text(l, textX, sigY + i * LH.body));

  return y + entryH + 4;
}

function renderSignal(doc, y, signal, index) {
  const lines = D.lines(doc, signal.trim(), P.col - 16, false, 9.5);
  const blockH = Math.max(lines.length * LH.body, 8) + 8;

  D.fill(doc, P.marginX, y, 8, 8, P.accentLight);
  D.stroke(doc, P.marginX, y, 8, 8, [178, 172, 212], 0.35);
  D.font(doc, true, 7); D.color(doc, P.accent);
  doc.text(String(index + 1), P.marginX + 2.2, y + 5.8);

  D.font(doc, false, 9.5); D.color(doc, P.ink);
  lines.forEach((l, i) => doc.text(l, P.marginX + 13, y + 5.5 + i * LH.body));
  return y + blockH + 2;
}

function renderDataSummary(doc, y, ds, deliveryCount, startDate, endDate) {
  const stats = [
    { label: 'ISSUES ANALYZED', val: String(ds.digest_count || deliveryCount || '\u2014') },
    { label: 'DATE RANGE',      val: ds.date_range || `${startDate || ''} \u2013 ${endDate || ''}` },
    { label: 'MOST ACTIVE',     val: ds.most_active_period || '\u2014' },
  ];
  const cellW = Math.floor(P.col / 3);
  const panelH = 30;

  D.fill(doc, P.marginX, y, P.col, panelH, P.cardBg);
  D.stroke(doc, P.marginX, y, P.col, panelH, P.cardBorder, 0.3);

  stats.forEach(({ label, val }, ci) => {
    const x = P.marginX + ci * cellW + 6;
    if (ci > 0) D.line(doc, P.marginX + ci * cellW, y + 5, P.marginX + ci * cellW, y + panelH - 5, P.ruleColor, 0.3);
    D.font(doc, false, 7); D.color(doc, P.inkFaint); doc.text(label, x, y + 9);
    D.font(doc, true, 10); D.color(doc, P.ink);
    D.lines(doc, val, cellW - 10, true, 10).slice(0, 2).forEach((l, li) => doc.text(l, x, y + 17 + li * 5.5));
  });

  return y + panelH + 4;
}

// ─── COVER PAGE ───────────────────────────────────────────────────────────────

function buildCover(doc, digestName, startDate, endDate, deliveryCount) {
  D.fill(doc, 0, 0, P.pageW, P.pageH, P.white);
  D.fill(doc, 0, 0, P.pageW, 3, P.amber);

  // Wordmark
  D.fill(doc, P.marginX, 16, 12, 12, P.amber);
  D.font(doc, true, 8); D.color(doc, P.white); doc.text('M', P.marginX + 3.8, 24.5);
  D.font(doc, true, 10); D.color(doc, P.ink);  doc.text('MergeRSS', P.marginX + 16, 24.5);

  D.font(doc, false, 7); D.color(doc, P.inkMuted); doc.text('INTELLIGENCE REPORT', P.marginX, 50);
  D.line(doc, P.marginX, 54, P.marginX + P.col, 54, P.ruleColor, 0.6);

  // Title
  D.font(doc, true, 26); D.color(doc, P.ink);
  const tLines = doc.splitTextToSize(digestName, P.col);
  let ty = 68;
  tLines.slice(0, 4).forEach(l => { doc.text(l, P.marginX, ty); ty += 12; });

  D.font(doc, false, 12); D.color(doc, P.amber);
  doc.text('Trend & Intelligence Report', P.marginX, ty + 4);

  let dateStr = '';
  try { dateStr = `${format(new Date(startDate), 'MMMM d, yyyy')} \u2013 ${format(new Date(endDate), 'MMMM d, yyyy')}`; }
  catch { dateStr = `${startDate || ''} \u2013 ${endDate || ''}`; }
  D.font(doc, false, 9.5); D.color(doc, P.inkMuted); doc.text(dateStr, P.marginX, ty + 16);

  const statsY = ty + 32;
  D.line(doc, P.marginX, statsY, P.marginX + P.col, statsY, P.ruleColor, 0.5);
  D.font(doc, true, 28); D.color(doc, P.amber); doc.text(String(deliveryCount), P.marginX, statsY + 16);
  D.font(doc, false, 8); D.color(doc, P.inkMuted); doc.text('DIGEST ISSUES ANALYZED', P.marginX + 22, statsY + 16);
  D.line(doc, P.marginX, statsY + 22, P.marginX + P.col, statsY + 22, P.ruleColor, 0.5);

  const metaY = statsY + 32;
  D.fill(doc, P.marginX, metaY, P.col, 30, P.cardBg);
  D.stroke(doc, P.marginX, metaY, P.col, 30, P.cardBorder, 0.3);
  D.font(doc, false, 7); D.color(doc, P.inkFaint); doc.text('PREPARED BY', P.marginX + 6, metaY + 7);
  D.font(doc, true, 9.5); D.color(doc, P.ink); doc.text('MergeRSS Intelligence Engine', P.marginX + 6, metaY + 14);
  D.font(doc, false, 7); D.color(doc, P.inkFaint); doc.text('GENERATED', P.marginX + 90, metaY + 7);
  D.font(doc, true, 9.5); D.color(doc, P.ink); doc.text(format(new Date(), 'MMMM d, yyyy'), P.marginX + 90, metaY + 14);

  const discY = metaY + 40;
  D.font(doc, false, 7.5); D.color(doc, P.inkFaint);
  const disc = 'This report was generated by an AI-powered analysis engine from curated digest data. Content is for informational purposes only and reflects data available within the specified date range.';
  doc.splitTextToSize(disc, P.col).forEach((l, i) => doc.text(l, P.marginX, discY + i * 4.6));

  D.line(doc, P.marginX, P.pageH - 16, P.marginX + P.col, P.pageH - 16, P.ruleColor, 0.4);
  D.font(doc, false, 7); D.color(doc, P.inkFaint);
  doc.text('CONFIDENTIAL  \u00B7  MERGRESS INTELLIGENCE', P.marginX, P.pageH - 9);
  doc.text('mergerss.com', P.pageW - P.marginX, P.pageH - 9, { align: 'right' });
}

function buildBackPage(doc, state) {
  breakPage(doc, state);
  const cx = P.pageW / 2, cy = P.pageH / 2 - 15;
  D.fill(doc, cx - 12, cy - 12, 24, 24, P.amber);
  D.font(doc, true, 14); D.color(doc, P.white); doc.text('M', cx - 4, cy + 4);
  D.font(doc, true, 18); D.color(doc, P.ink); doc.text('MergeRSS', cx, cy + 22, { align: 'center' });
  D.font(doc, false, 10); D.color(doc, P.inkMuted); doc.text('Intelligence. Curated.', cx, cy + 31, { align: 'center' });
  D.line(doc, cx - 35, cy + 38, cx + 35, cy + 38, P.ruleColor, 0.4);
  D.font(doc, false, 8.5); D.color(doc, P.inkFaint); doc.text('mergerss.com', cx, cy + 46, { align: 'center' });
}

// ─── RENDER PASS ──────────────────────────────────────────────────────────────
// Iterates the page plan. Each new plan entry = intentional page break.

function renderPages(doc, plans, state, reportContext) {
  const { r, deliveryCount, startDate, endDate, mismatchMsg } = reportContext;
  let isFirstContentPage = true;

  for (const plan of plans) {
    if (isFirstContentPage) {
      doc.addPage();
      state.page = 2;
      initPage(doc, state);
      isFirstContentPage = false;
    } else {
      breakPage(doc, state);
    }

    let y = P.marginY;

    for (const item of plan.items) {
      switch (item.type) {
        case 'warning':
          y = renderWarningBanner(doc, y, mismatchMsg);
          y += 2;
          break;

        case 'sectionHeader':
          y = drawSectionHeader(doc, y, item.num, item.label);
          break;

        case 'keyTakeaway':
          y = renderKeyTakeaway(doc, y, item.summary);
          break;

        case 'para':
          y = D.text(doc, item.text, P.marginX, y, { size: 9.5, rgb: P.inkSub, maxW: P.col, lh: LH.body });
          y += 4;
          break;

        case 'theme':
          y = renderThemeBlock(doc, y, item.theme, item.index);
          break;

        case 'trajectories':
          y = renderTrajectoryColumns(doc, y, item.report);
          break;

        case 'inflection':
          y = renderInflectionEntry(doc, y, item.pt, item.isLast);
          break;

        case 'signal':
          y = renderSignal(doc, y, item.signal, item.index);
          break;

        case 'dataSummary':
          y = renderDataSummary(doc, y, item.data, deliveryCount, startDate, endDate);
          break;

        case 'rule':
          y = drawRule(doc, y);
          y += 3;
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

  // Build mismatch message if applicable
  const hasMismatch = actualStart && actualEnd && startDate && endDate &&
    (actualStart !== startDate || actualEnd !== endDate);
  let mismatchMsg = '';
  if (hasMismatch) {
    let ds = actualStart, de = actualEnd;
    try { ds = format(new Date(actualStart), 'MMM d, yyyy'); } catch {}
    try { de = format(new Date(actualEnd), 'MMM d, yyyy'); } catch {}
    mismatchMsg = `Note: Data is available for ${ds} \u2013 ${de} only. Analysis reflects available issues within the requested range.`;
  }

  // ── Phase 1: Cover (no planning needed — fixed layout) ───────────────────
  buildCover(doc, digestName, startDate, endDate, deliveryCount);

  // ── Phase 2: PLAN — pre-calculate all block heights, group into pages ────
  const pagePlans = planPages(doc, r, hasMismatch);

  // ── Phase 3: RENDER — execute the plan page by page ─────────────────────
  renderPages(doc, pagePlans, state, { r, deliveryCount, startDate, endDate, mismatchMsg });

  // ── Back page ────────────────────────────────────────────────────────────
  buildBackPage(doc, state);

  // ── Save ─────────────────────────────────────────────────────────────────
  const safeName = digestName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const safeDate = startDate ? startDate.slice(0, 10) : 'report';
  doc.save(`${safeName}-report-${safeDate}.pdf`);
}
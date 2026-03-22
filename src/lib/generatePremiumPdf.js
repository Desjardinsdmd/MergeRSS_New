import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

// ─── Print Design System ──────────────────────────────────────────────────────
// Letter (8.5" × 11") — print-safe light theme with MergeRSS brand accents.
// All measurements in mm. 1 inch = 25.4mm. Letter = 215.9 × 279.4mm.

const P = {
  // Page dimensions (letter)
  pageW:   215.9,
  pageH:   279.4,
  marginX: 19.05,  // 0.75" margins
  marginY: 19.05,
  get col() { return this.pageW - this.marginX * 2; },  // ~177.8mm
  get bodyBottom() { return this.pageH - 16; },          // footer zone starts

  // Brand colors — print-safe (work on white paper)
  amber:        [180, 120, 0],     // darker amber — legible on white
  amberLight:   [255, 248, 220],   // very pale amber tint for callout bg
  amberBorder:  [200, 150, 20],    // amber border for callout box
  accent:       [60, 40, 120],     // deep purple for section numbers/accents
  accentLight:  [240, 237, 250],   // pale purple for section header bg

  // Text hierarchy
  ink:          [20, 20, 20],      // near-black body text
  inkSub:       [60, 60, 60],      // secondary body text
  inkMuted:     [110, 110, 110],   // labels, metadata
  inkFaint:     [160, 160, 160],   // faint rule text, footer

  // Surface / structure
  white:        [255, 255, 255],
  pageBg:       [255, 255, 255],
  ruleColor:    [200, 200, 200],   // section divider lines
  cardBg:       [248, 248, 248],   // subtle card fill
  cardBorder:   [220, 220, 220],   // card stroke

  // Trajectory status colors — print-legible
  emerald:      [0, 130, 80],
  emeraldBg:    [230, 248, 238],
  red:          [185, 40, 40],
  redBg:        [252, 232, 232],
  blue:         [30, 80, 180],
  blueBg:       [228, 238, 255],
  orange:       [180, 90, 0],
  orangeBg:     [255, 240, 220],
  grayText:     [100, 100, 100],
  grayBg:       [238, 238, 238],
};

// Line height multipliers for print
const LH = {
  body:  6.2,   // 9.5pt body text line height
  small: 5.2,   // 8pt small text
  label: 4.6,   // 7pt label text
  large: 7.0,   // 11pt heading
};

// ─── Primitive helpers ────────────────────────────────────────────────────────

function font(doc, bold, size) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
}

function color(doc, rgb) {
  doc.setTextColor(...rgb);
}

function fill(doc, x, y, w, h, rgb) {
  doc.setFillColor(...rgb);
  doc.rect(x, y, w, h, 'F');
}

function stroke(doc, x, y, w, h, rgb, lw = 0.3) {
  doc.setDrawColor(...rgb);
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h, 'S');
}

function line(doc, x1, y1, x2, y2, rgb, lw = 0.3) {
  doc.setDrawColor(...rgb);
  doc.setLineWidth(lw);
  doc.line(x1, y1, x2, y2);
}

// Measure wrapped lines without rendering
function measure(doc, text, maxW, bold, size) {
  font(doc, bold, size);
  return doc.splitTextToSize(String(text || ''), maxW);
}

// Render wrapped text block, return new Y
function text(doc, str, x, y, { size = 9.5, rgb = P.ink, bold = false, maxW = P.col, lh, align = 'left' } = {}) {
  font(doc, bold, size);
  color(doc, rgb);
  const lineH = lh || LH.body;
  const lines = doc.splitTextToSize(String(str || ''), maxW);
  for (const l of lines) {
    doc.text(l, x, y, { align });
    y += lineH;
  }
  return y;
}

// ─── Page management ─────────────────────────────────────────────────────────

function initPage(doc, state) {
  fill(doc, 0, 0, P.pageW, P.pageH, P.pageBg);
  drawFooter(doc, state.page, state.digestName, state.reportDate);
}

function addPage(doc, state) {
  doc.addPage();
  state.page++;
  initPage(doc, state);
  return P.marginY;
}

// Ensure `needed` mm fits before bottom. Returns new Y (possibly on a new page).
function need(doc, y, needed, state) {
  if (y + needed > P.bodyBottom) {
    return addPage(doc, state);
  }
  return y;
}

// ─── Running footer ───────────────────────────────────────────────────────────

function drawFooter(doc, pageNum, digestName, reportDate) {
  const fy = P.pageH - 8;
  line(doc, P.marginX, P.pageH - 13, P.pageW - P.marginX, P.pageH - 13, P.ruleColor, 0.4);
  font(doc, false, 7);
  color(doc, P.inkFaint);
  doc.text(`MergeRSS Intelligence Report  ·  ${digestName || ''}`, P.marginX, fy);
  doc.text(String(pageNum), P.pageW - P.marginX, fy, { align: 'right' });
  if (reportDate) {
    doc.text(reportDate, P.pageW / 2, fy, { align: 'center' });
  }
}

// ─── Section header ───────────────────────────────────────────────────────────
// Always keep section header + at least 20mm of content together (ensured by caller).

function sectionHeader(doc, y, num, label) {
  const barH = 10;

  // Pale purple background bar
  fill(doc, 0, y, P.pageW, barH, P.accentLight);
  line(doc, 0, y + barH, P.pageW, y + barH, [200, 195, 220], 0.5);

  // Section number — purple accent
  font(doc, true, 7.5);
  color(doc, P.accent);
  doc.text(num, P.marginX, y + barH - 2.5);

  // Pip separator
  line(doc, P.marginX + 9, y + 2.5, P.marginX + 9, y + barH - 2.5, [180, 175, 210], 0.5);

  // Section label — dark ink, uppercase tracked
  font(doc, true, 7.5);
  color(doc, P.inkSub);
  doc.text(label, P.marginX + 13, y + barH - 2.5);

  return y + barH + 5;
}

// Horizontal rule between sections
function rule(doc, y) {
  line(doc, P.marginX, y, P.marginX + P.col, y, P.ruleColor, 0.4);
  return y + 9;
}

// ─── COVER PAGE ───────────────────────────────────────────────────────────────

function buildCover(doc, digestName, startDate, endDate, deliveryCount) {
  fill(doc, 0, 0, P.pageW, P.pageH, P.pageBg);

  // Top brand stripe — amber
  fill(doc, 0, 0, P.pageW, 3, P.amber);

  // Wordmark
  fill(doc, P.marginX, 16, 12, 12, P.amber);
  font(doc, true, 8);
  color(doc, P.white);
  doc.text('M', P.marginX + 3.8, 24.5);
  font(doc, true, 10);
  color(doc, P.ink);
  doc.text('MergeRSS', P.marginX + 16, 24.5);

  // Report type label
  font(doc, false, 7);
  color(doc, P.inkMuted);
  doc.text('INTELLIGENCE REPORT', P.marginX, 50);

  line(doc, P.marginX, 54, P.marginX + P.col, 54, P.ruleColor, 0.6);

  // Report title
  font(doc, true, 26);
  color(doc, P.ink);
  const titleLines = doc.splitTextToSize(digestName, P.col);
  let ty = 68;
  titleLines.slice(0, 4).forEach(l => {
    doc.text(l, P.marginX, ty);
    ty += 12;
  });

  // Subtitle
  font(doc, false, 12);
  color(doc, P.amber);
  doc.text('Trend & Intelligence Report', P.marginX, ty + 4);

  // Date range
  let dateStr = '';
  try {
    dateStr = `${format(new Date(startDate), 'MMMM d, yyyy')} \u2013 ${format(new Date(endDate), 'MMMM d, yyyy')}`;
  } catch { dateStr = `${startDate || ''} \u2013 ${endDate || ''}`; }

  font(doc, false, 9.5);
  color(doc, P.inkMuted);
  doc.text(dateStr, P.marginX, ty + 16);

  // Stats block
  const statsY = ty + 32;
  line(doc, P.marginX, statsY, P.marginX + P.col, statsY, P.ruleColor, 0.5);

  font(doc, true, 28);
  color(doc, P.amber);
  doc.text(String(deliveryCount), P.marginX, statsY + 16);
  font(doc, false, 8);
  color(doc, P.inkMuted);
  doc.text('DIGEST ISSUES ANALYZED', P.marginX + 22, statsY + 16);

  line(doc, P.marginX, statsY + 22, P.marginX + P.col, statsY + 22, P.ruleColor, 0.5);

  // Metadata panel
  const metaY = statsY + 32;
  fill(doc, P.marginX, metaY, P.col, 30, P.cardBg);
  stroke(doc, P.marginX, metaY, P.col, 30, P.cardBorder, 0.3);

  font(doc, false, 7);
  color(doc, P.inkFaint);
  doc.text('PREPARED BY', P.marginX + 6, metaY + 7);
  font(doc, true, 9.5);
  color(doc, P.ink);
  doc.text('MergeRSS Intelligence Engine', P.marginX + 6, metaY + 14);

  font(doc, false, 7);
  color(doc, P.inkFaint);
  doc.text('GENERATED', P.marginX + 90, metaY + 7);
  font(doc, true, 9.5);
  color(doc, P.ink);
  doc.text(format(new Date(), 'MMMM d, yyyy'), P.marginX + 90, metaY + 14);

  // Disclaimer
  const discY = metaY + 40;
  font(doc, false, 7.5);
  color(doc, P.inkFaint);
  const disc = 'This report was generated by an AI-powered analysis engine from curated digest data. Content is for informational purposes only and reflects data available within the specified date range.';
  const discLines = doc.splitTextToSize(disc, P.col);
  discLines.forEach((l, i) => doc.text(l, P.marginX, discY + i * 4.6));

  // Bottom footer
  line(doc, P.marginX, P.pageH - 16, P.marginX + P.col, P.pageH - 16, P.ruleColor, 0.4);
  font(doc, false, 7);
  color(doc, P.inkFaint);
  doc.text('CONFIDENTIAL  \u00B7  MERGRESS INTELLIGENCE', P.marginX, P.pageH - 9);
  doc.text('mergerss.com', P.pageW - P.marginX, P.pageH - 9, { align: 'right' });
}

// ─── Key Takeaway Callout ─────────────────────────────────────────────────────
// Full-width callout with left amber bar — print-native treatment.

function keyTakeaway(doc, y, summary) {
  const firstSentence = summary.split(/(?<=[.!?])\s+/)[0] || summary.slice(0, 350);
  const innerW = P.col - 14;
  const lines = measure(doc, firstSentence, innerW, false, 10);
  const boxH = lines.length * LH.body + 18;

  // Pale amber background
  fill(doc, P.marginX, y, P.col, boxH, P.amberLight);
  // Amber left bar
  fill(doc, P.marginX, y, 3, boxH, P.amber);
  // Subtle border
  stroke(doc, P.marginX, y, P.col, boxH, P.amberBorder, 0.3);

  font(doc, true, 7);
  color(doc, P.amber);
  doc.text('KEY TAKEAWAY', P.marginX + 8, y + 7);

  font(doc, false, 10);
  color(doc, P.ink);
  lines.forEach((l, i) => doc.text(l, P.marginX + 8, y + 14 + i * LH.body));

  return y + boxH + 6;
}

// ─── Warning banner ───────────────────────────────────────────────────────────

function warningBanner(doc, y, msg) {
  const lines = measure(doc, msg, P.col - 14, false, 8.5);
  const h = lines.length * LH.small + 12;
  fill(doc, P.marginX, y, P.col, h, [255, 248, 220]);
  fill(doc, P.marginX, y, 3, h, P.amber);
  stroke(doc, P.marginX, y, P.col, h, P.amberBorder, 0.3);
  font(doc, false, 8.5);
  color(doc, [130, 80, 0]);
  lines.forEach((l, i) => doc.text(l, P.marginX + 10, y + 8 + i * LH.small));
  return y + h + 5;
}

// ─── Theme block ─────────────────────────────────────────────────────────────
// Print-native: number + title row, trajectory label inline, full description below.
// No fixed height — expands naturally. Page-break safe.

const TRAJ_PRINT = {
  rising:    { label: 'Rising \u2191',    fg: [0, 120, 70],   bg: [228, 248, 236] },
  falling:   { label: 'Falling \u2193',   fg: [160, 30, 30],  bg: [252, 230, 230] },
  stable:    { label: 'Stable \u2192',    fg: [90, 90, 90],   bg: [238, 238, 238] },
  volatile:  { label: 'Volatile',         fg: [160, 80, 0],   bg: [255, 238, 210] },
  peaked:    { label: 'Peaked',           fg: [160, 80, 0],   bg: [255, 238, 210] },
  resolving: { label: 'Resolving \u2198', fg: [20, 70, 170],  bg: [225, 235, 255] },
};

function trajLabel(doc, x, y, trajectory) {
  const cfg = TRAJ_PRINT[trajectory] || TRAJ_PRINT.stable;
  font(doc, true, 7);
  const w = doc.getTextWidth(cfg.label) + 8;
  fill(doc, x, y - 5, w, 7, cfg.bg);
  color(doc, cfg.fg);
  doc.text(cfg.label, x + 4, y);
  return w;
}

function themeBlock(doc, y, theme, index, state) {
  const num = String(index + 1).padStart(2, '0');
  const titleW = P.col - 55;
  const descW  = P.col - 10;

  const titleLines = measure(doc, theme.theme || '', titleW, true, 11);
  const descLines  = measure(doc, theme.description || '', descW, false, 9);

  // Total block height: divider(1) + number row(14) + gap(4) + description + padding(8)
  const titleH = titleLines.length * LH.large;
  const descH  = descLines.length * LH.body;
  const blockH = titleH + descH + 22;

  y = need(doc, y, blockH, state);

  // Top rule in amber
  fill(doc, P.marginX, y, P.col, 1, P.amber);

  // Light card bg
  fill(doc, P.marginX, y + 1, P.col, blockH - 1, P.cardBg);
  stroke(doc, P.marginX, y, P.col, blockH, P.cardBorder, 0.25);

  // Index number — accent purple
  font(doc, true, 8);
  color(doc, P.accent);
  doc.text(num, P.marginX + 5, y + 10);

  // Theme title — dark ink, bold
  font(doc, true, 11);
  color(doc, P.ink);
  const titleX = P.marginX + 14;
  titleLines.forEach((l, i) => doc.text(l, titleX, y + 10 + i * LH.large));

  // Trajectory label — right aligned in same row
  const cfg = TRAJ_PRINT[theme.trajectory] || TRAJ_PRINT.stable;
  font(doc, true, 7);
  const pillW = doc.getTextWidth(cfg.label) + 8;
  const pillX = P.marginX + P.col - pillW - 4;
  fill(doc, pillX, y + 4, pillW, 7, cfg.bg);
  color(doc, cfg.fg);
  doc.text(cfg.label, pillX + 4, y + 9.5);

  // Description — full text, readable line height
  const descY = y + titleH + 16;
  font(doc, false, 9);
  color(doc, P.inkSub);
  descLines.forEach((l, i) => doc.text(l, titleX, descY + i * LH.body));

  return y + blockH + 4;
}

// ─── Trend trajectory columns ─────────────────────────────────────────────────
// 3 columns side-by-side. Falls back to stacked if only 1-2 active columns.
// Entire block is kept together with need().

function trajectoryColumns(doc, y, report, state) {
  const colDefs = [
    { items: report.escalating_topics   || [], label: 'ESCALATING \u2191',    fg: [0, 120, 70],   hdrBg: [215, 245, 228], bodyBg: [238, 250, 242] },
    { items: report.deescalating_topics || [], label: 'DE-ESCALATING \u2193', fg: [20, 70, 170],  hdrBg: [215, 228, 255], bodyBg: [235, 242, 255] },
    { items: report.cyclical_topics     || [], label: 'CYCLICAL',             fg: [160, 80, 0],   hdrBg: [255, 238, 210], bodyBg: [255, 248, 232] },
  ];

  const active = colDefs.filter(c => c.items.length > 0);
  if (!active.length) return y;

  const gutter = 5;
  const colW = Math.floor((P.col - gutter * (active.length - 1)) / active.length);

  // Measure tallest column
  let maxColH = 12;
  for (const col of active) {
    let h = 12; // header
    font(doc, false, 9);
    for (const item of col.items) {
      const ls = doc.splitTextToSize(`\u2022  ${item}`, colW - 10);
      h += ls.length * LH.body + 2;
    }
    h += 8; // bottom padding
    if (h > maxColH) maxColH = h;
  }

  y = need(doc, y, maxColH + 4, state);

  active.forEach((col, ci) => {
    const x = P.marginX + ci * (colW + gutter);

    // Column header
    fill(doc, x, y, colW, 12, col.hdrBg);
    stroke(doc, x, y, colW, maxColH, col.fg.map ? col.fg : P.cardBorder, 0.3);
    font(doc, true, 7.5);
    color(doc, col.fg);
    doc.text(col.label, x + 5, y + 8.5);

    // Body
    fill(doc, x, y + 12, colW, maxColH - 12, col.bodyBg);

    font(doc, false, 9);
    color(doc, P.ink);
    let iy = y + 21;
    col.items.forEach(item => {
      const ls = doc.splitTextToSize(`\u2022  ${item}`, colW - 10);
      ls.forEach(l => {
        if (iy < y + maxColH - 2) {
          doc.text(l, x + 5, iy);
          iy += LH.body;
        }
      });
      iy += 2;
    });
  });

  return y + maxColH + 8;
}

// ─── Inflection point (timeline entry) ───────────────────────────────────────
// Amber dot + vertical connector. Each entry is kept atomic (no mid-entry page breaks).

function inflectionEntry(doc, y, pt, isLast, state) {
  const eventLines = measure(doc, pt.event || '', P.col - 20, true, 10.5);
  const sigLines   = measure(doc, pt.significance || '', P.col - 20, false, 9);

  const entryH = 8 + eventLines.length * LH.large + sigLines.length * LH.body + 10;
  y = need(doc, y, entryH, state);

  const dotX = P.marginX + 5.5;

  // Amber dot
  doc.setFillColor(...P.amber);
  doc.circle(dotX, y + 5, 2.8, 'F');

  // Connector line to next entry — drawn after content, to full entry height
  if (!isLast) {
    line(doc, dotX, y + 8, dotX, y + entryH + 4, P.ruleColor, 0.6);
  }

  const textX = P.marginX + 16;

  // Date label
  font(doc, true, 7.5);
  color(doc, P.amber);
  doc.text((pt.date || '').toUpperCase(), textX, y + 6);

  // Event headline
  font(doc, true, 10.5);
  color(doc, P.ink);
  eventLines.forEach((l, i) => doc.text(l, textX, y + 13 + i * LH.large));

  // Significance
  const sigY = y + 13 + eventLines.length * LH.large + 2;
  font(doc, false, 9);
  color(doc, P.inkSub);
  sigLines.forEach((l, i) => doc.text(l, textX, sigY + i * LH.body));

  return y + entryH + 4;
}

// ─── Outlook signal ───────────────────────────────────────────────────────────
// Numbered square badge + signal sentence. Kept whole per signal.

function outlookSignal(doc, y, signal, index, state) {
  const sigLines = measure(doc, signal.trim(), P.col - 16, false, 9.5);
  const blockH = Math.max(sigLines.length * LH.body, 8) + 8;

  y = need(doc, y, blockH, state);

  // Number badge
  fill(doc, P.marginX, y, 8, 8, P.accentLight);
  stroke(doc, P.marginX, y, 8, 8, [180, 175, 215], 0.35);
  font(doc, true, 7);
  color(doc, P.accent);
  doc.text(String(index + 1), P.marginX + 2.2, y + 5.8);

  // Signal text
  font(doc, false, 9.5);
  color(doc, P.ink);
  sigLines.forEach((l, i) => doc.text(l, P.marginX + 13, y + 5.5 + i * LH.body));

  return y + blockH + 2;
}

// ─── Data summary panel ───────────────────────────────────────────────────────
// 3-cell stat panel in a light card. Kept whole.

function dataSummaryPanel(doc, y, ds, deliveryCount, startDate, endDate) {
  const stats = [
    { label: 'ISSUES ANALYZED', val: String(ds.digest_count || deliveryCount || '\u2014') },
    { label: 'DATE RANGE',      val: ds.date_range || `${startDate || ''} \u2013 ${endDate || ''}` },
    { label: 'MOST ACTIVE',     val: ds.most_active_period || '\u2014' },
  ];

  const cellW = Math.floor(P.col / 3);
  const panelH = 30;

  fill(doc, P.marginX, y, P.col, panelH, P.cardBg);
  stroke(doc, P.marginX, y, P.col, panelH, P.cardBorder, 0.3);

  stats.forEach(({ label, val }, ci) => {
    const x = P.marginX + ci * cellW + 6;
    if (ci > 0) {
      line(doc, P.marginX + ci * cellW, y + 5, P.marginX + ci * cellW, y + panelH - 5, P.ruleColor, 0.3);
    }

    font(doc, false, 7);
    color(doc, P.inkFaint);
    doc.text(label, x, y + 9);

    font(doc, true, 10);
    color(doc, P.ink);
    const vl = doc.splitTextToSize(val, cellW - 10);
    vl.slice(0, 2).forEach((l, li) => doc.text(l, x, y + 17 + li * 5.5));
  });

  return y + panelH + 4;
}

// ─── Back page ────────────────────────────────────────────────────────────────

function buildBackPage(doc, state) {
  addPage(doc, state);
  const cx = P.pageW / 2;
  const cy = P.pageH / 2 - 15;

  // Brand mark
  fill(doc, cx - 12, cy - 12, 24, 24, P.amber);
  font(doc, true, 14);
  color(doc, P.white);
  doc.text('M', cx - 4, cy + 4);

  font(doc, true, 18);
  color(doc, P.ink);
  doc.text('MergeRSS', cx, cy + 22, { align: 'center' });

  font(doc, false, 10);
  color(doc, P.inkMuted);
  doc.text('Intelligence. Curated.', cx, cy + 31, { align: 'center' });

  line(doc, cx - 35, cy + 38, cx + 35, cy + 38, P.ruleColor, 0.4);

  font(doc, false, 8.5);
  color(doc, P.inkFaint);
  doc.text('mergerss.com', cx, cy + 46, { align: 'center' });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generatePremiumPdf(savedReport) {
  // letter format, portrait
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });

  const r            = savedReport.report || {};
  const digestName   = savedReport.digest_name || 'Intelligence Report';
  const startDate    = savedReport.start_date || '';
  const endDate      = savedReport.end_date || '';
  const deliveryCount = savedReport.delivery_count || 0;
  const actualStart  = savedReport.actual_start;
  const actualEnd    = savedReport.actual_end;

  let reportDateStr = '';
  try { reportDateStr = format(new Date(), 'MMMM d, yyyy'); } catch {}

  const state = {
    page: 1,
    digestName,
    reportDate: reportDateStr,
  };

  // ── Cover ────────────────────────────────────────────────────────────────
  buildCover(doc, digestName, startDate, endDate, deliveryCount);

  // ── Content pages ────────────────────────────────────────────────────────
  doc.addPage();
  state.page = 2;
  initPage(doc, state);
  let y = P.marginY;

  // Range mismatch notice
  const rangeMismatch = actualStart && actualEnd && startDate && endDate &&
    (actualStart !== startDate || actualEnd !== endDate);
  if (rangeMismatch) {
    let ds = actualStart, de = actualEnd;
    try { ds = format(new Date(actualStart), 'MMM d, yyyy'); } catch {}
    try { de = format(new Date(actualEnd), 'MMM d, yyyy'); } catch {}
    y = warningBanner(doc, y, `Note: Data is available for ${ds} \u2013 ${de} only. Analysis reflects available issues within the requested range.`);
  }

  // ── 01 Executive Summary ─────────────────────────────────────────────────
  y = need(doc, y, 40, state);
  y = sectionHeader(doc, y, '01', 'EXECUTIVE SUMMARY');

  if (r.executive_summary) {
    y = need(doc, y, 30, state);
    y = keyTakeaway(doc, y, r.executive_summary);

    // Full body — paragraph by paragraph
    const paras = r.executive_summary.split(/\n+/).filter(p => p.trim());
    for (const para of paras) {
      const lines = measure(doc, para, P.col, false, 9.5);
      const ph = lines.length * LH.body + 4;
      y = need(doc, y, ph, state);
      y = text(doc, para, P.marginX, y, { size: 9.5, rgb: P.inkSub, maxW: P.col, lh: LH.body });
      y += 4;
    }
  }

  y += 3;
  y = rule(doc, y);

  // ── 02 Key Themes ────────────────────────────────────────────────────────
  if (r.key_themes?.length > 0) {
    y = need(doc, y, 30, state);
    y = sectionHeader(doc, y, '02', 'KEY THEMES & EVOLUTION');

    for (let i = 0; i < r.key_themes.length; i++) {
      y = themeBlock(doc, y, r.key_themes[i], i, state);
    }

    y += 3;
    y = rule(doc, y);
  }

  // ── 03 Trend Trajectories ────────────────────────────────────────────────
  const hasTraj = r.escalating_topics?.length || r.deescalating_topics?.length || r.cyclical_topics?.length;
  if (hasTraj) {
    y = need(doc, y, 30, state);
    y = sectionHeader(doc, y, '03', 'TREND TRAJECTORIES');
    y = trajectoryColumns(doc, y, r, state);
    y += 2;
    y = rule(doc, y);
  }

  // ── 04 Inflection Points ─────────────────────────────────────────────────
  if (r.inflection_points?.length > 0) {
    y = need(doc, y, 35, state);
    y = sectionHeader(doc, y, '04', 'INFLECTION POINTS');
    y += 4;

    for (let i = 0; i < r.inflection_points.length; i++) {
      y = inflectionEntry(doc, y, r.inflection_points[i], i === r.inflection_points.length - 1, state);
    }

    y += 3;
    y = rule(doc, y);
  }

  // ── 05 Outlook & Forward Signals ─────────────────────────────────────────
  if (r.outlook) {
    y = need(doc, y, 30, state);
    y = sectionHeader(doc, y, '05', 'OUTLOOK & FORWARD SIGNALS');
    y += 4;

    const signals = r.outlook.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 8);
    for (let i = 0; i < signals.length; i++) {
      y = outlookSignal(doc, y, signals[i], i, state);
    }

    y += 3;
    y = rule(doc, y);
  }

  // ── 06 Data Summary ──────────────────────────────────────────────────────
  if (r.data_summary) {
    y = need(doc, y, 45, state);
    y = sectionHeader(doc, y, '06', 'DATA SUMMARY');
    y += 4;
    y = dataSummaryPanel(doc, y, r.data_summary, deliveryCount, startDate, endDate);
  }

  // ── Back page ────────────────────────────────────────────────────────────
  buildBackPage(doc, state);

  // ── Save ─────────────────────────────────────────────────────────────────
  const safeName = digestName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const safeDate = startDate ? startDate.slice(0, 10) : 'report';
  doc.save(`${safeName}-report-${safeDate}.pdf`);
}
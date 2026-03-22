import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Dark theme matching the app's stone/amber palette
const C = {
  // Backgrounds
  pageBg:      [10, 8, 5],          // #0a0805 — deepest app bg
  cardBg:      [20, 16, 10],        // stone-900 equiv
  cardBg2:     [26, 22, 14],        // stone-800 equiv
  sectionDark: [15, 12, 8],         // slightly darker panel

  // Amber brand
  amber:       [251, 191, 36],      // primary brand — hsl(38,95%,54%)
  amberDark:   [140, 95, 10],       // darker amber for non-primary section bars
  amberBg:     [35, 26, 4],         // very dark amber tint for callout box

  // Text
  white:       [255, 255, 255],
  textPrimary: [225, 215, 200],     // stone-200 equiv — main body
  textSub:     [180, 168, 152],     // stone-300 equiv
  textMuted:   [130, 120, 108],     // stone-500 equiv
  textFaint:   [70, 64, 56],        // stone-700 equiv

  // Borders / dividers
  border:      [38, 32, 22],        // stone-800
  borderLight: [55, 46, 32],        // stone-700

  // Trajectory colors (visible on dark)
  emerald:     [52, 211, 153],      // emerald-400
  emeraldBg:   [6, 30, 18],
  red:         [248, 113, 113],     // red-400
  redBg:       [32, 8, 8],
  blue:        [96, 165, 250],      // blue-400
  blueBg:      [8, 20, 45],
  orange:      [251, 146, 60],      // orange-400
  orangeBg:    [32, 16, 4],
  stone:       [120, 113, 108],     // stone-500

  // Page geometry (A4 in mm)
  pageW:  210,
  pageH:  297,
  margin: 16,
  col:    178,  // pageW - margin*2
};

// ─── Low-level helpers ────────────────────────────────────────────────────────

function setFont(doc, bold = false, size = 10) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
}

function setColor(doc, color) {
  doc.setTextColor(...color);
}

function fillRect(doc, x, y, w, h, color) {
  doc.setFillColor(...color);
  doc.rect(x, y, w, h, 'F');
}

function strokeRect(doc, x, y, w, h, color, lineW = 0.3) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lineW);
  doc.rect(x, y, w, h, 'S');
}

function drawLine(doc, x1, y1, x2, y2, color, width = 0.3) {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(x1, y1, x2, y2);
}

// Measure wrapped line count without rendering
function lineCount(doc, str, maxW, bold = false, size = 10) {
  setFont(doc, bold, size);
  return doc.splitTextToSize(String(str || ''), maxW).length;
}

// Write wrapped text, returns new Y position
function writeText(doc, str, x, y, { size = 10, color = C.textPrimary, bold = false, maxW = C.col, lineH, align = 'left' } = {}) {
  setFont(doc, bold, size);
  setColor(doc, color);
  const lh = lineH || (size * 0.44);
  const lines = doc.splitTextToSize(String(str || ''), maxW);
  lines.forEach(line => {
    doc.text(line, x, y, { align });
    y += lh;
  });
  return y;
}

// Add a new page and initialize it with background + footer
function newPage(doc, state) {
  doc.addPage();
  state.page++;
  fillRect(doc, 0, 0, C.pageW, C.pageH, C.pageBg);
  addFooter(doc, state.page);
  return 20;
}

// Check if content fits; if not, break to new page. Returns updated y.
function ensureSpace(doc, y, needed, state) {
  if (y + needed > C.pageH - 16) {
    return newPage(doc, state);
  }
  return y;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function addFooter(doc, pageNum) {
  const y = C.pageH - 9;
  fillRect(doc, 0, C.pageH - 11, C.pageW, 11, C.cardBg2);
  drawLine(doc, 0, C.pageH - 11, C.pageW, C.pageH - 11, C.border, 0.4);
  setFont(doc, false, 7);
  setColor(doc, C.textFaint);
  doc.text('MergeRSS Intelligence Report  ·  Confidential', C.margin, y);
  doc.text(String(pageNum), C.pageW - C.margin, y, { align: 'right' });
}

// ─── Section header bar ───────────────────────────────────────────────────────
// section 01 = amber/primary (matches screen exactly)
// sections 02–06 = dark stone with muted amber number (matches screen)

function sectionHeader(doc, y, num, label, isPrimary = false) {
  const barH = 11;
  if (isPrimary) {
    // Matches screen: bg-[hsl(var(--primary))] with dark text
    fillRect(doc, 0, y, C.pageW, barH, C.amber);
    setFont(doc, true, 7.5);
    setColor(doc, [10, 8, 5]);
    doc.text(num, C.margin, y + barH - 2.5);
    // vertical pip separator
    doc.setDrawColor(10, 8, 5);
    doc.setLineWidth(0.5);
    doc.line(C.margin + 8, y + 3, C.margin + 8, y + barH - 2);
    doc.text(label, C.margin + 12, y + barH - 2.5);
  } else {
    // Matches screen: bg-stone-900 with muted label
    fillRect(doc, 0, y, C.pageW, barH, C.cardBg2);
    drawLine(doc, 0, y + barH, C.pageW, y + barH, C.border, 0.4);
    setFont(doc, true, 7.5);
    setColor(doc, C.textFaint);
    doc.text(num, C.margin, y + barH - 2.5);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.5);
    doc.line(C.margin + 8, y + 3, C.margin + 8, y + barH - 2);
    setColor(doc, C.textMuted);
    doc.text(label, C.margin + 12, y + barH - 2.5);
  }
  return y + barH + 4;
}

// ─── COVER PAGE ───────────────────────────────────────────────────────────────

function buildCoverPage(doc, digestName, startDate, endDate, deliveryCount) {
  fillRect(doc, 0, 0, C.pageW, C.pageH, C.pageBg);

  // Top amber stripe
  fillRect(doc, 0, 0, C.pageW, 2.5, C.amber);

  // Brand mark
  fillRect(doc, C.margin, 14, 14, 14, C.amber);
  setFont(doc, true, 9);
  setColor(doc, [10, 8, 5]);
  doc.text('M', C.margin + 4.5, 24);
  setFont(doc, true, 10);
  setColor(doc, C.white);
  doc.text('MergeRSS', C.margin + 18, 24);

  // INTELLIGENCE REPORT label
  setFont(doc, false, 7);
  setColor(doc, C.textMuted);
  doc.text('INTELLIGENCE REPORT', C.margin, 52);

  drawLine(doc, C.margin, 56, C.margin + C.col, 56, C.border, 0.5);

  // Digest name — large, bold
  setFont(doc, true, 26);
  setColor(doc, C.white);
  const titleLines = doc.splitTextToSize(digestName.toUpperCase(), C.col);
  let ty = 70;
  titleLines.slice(0, 3).forEach(l => {
    doc.text(l, C.margin, ty);
    ty += 12;
  });

  // Subtitle
  setFont(doc, false, 12);
  setColor(doc, C.amber);
  doc.text('Trend & Intelligence Report', C.margin, ty + 4);

  // Date range
  let dateStr = '—';
  try {
    dateStr = `${format(new Date(startDate), 'MMMM d, yyyy')} \u2013 ${format(new Date(endDate), 'MMMM d, yyyy')}`;
  } catch {}
  setFont(doc, false, 9);
  setColor(doc, C.textMuted);
  doc.text(dateStr, C.margin, 150);

  // Issue count stat
  setFont(doc, true, 24);
  setColor(doc, C.amber);
  doc.text(String(deliveryCount), C.margin, 168);
  setFont(doc, false, 8);
  setColor(doc, C.textMuted);
  doc.text('DIGEST ISSUES ANALYZED', C.margin + 20, 168);

  // Amber rule
  drawLine(doc, 0, 182, C.pageW, 182, C.amberDark, 1.5);

  // Metadata block
  fillRect(doc, 0, 182, C.pageW, 62, C.cardBg);

  setFont(doc, false, 7);
  setColor(doc, C.textFaint);
  doc.text('PREPARED BY', C.margin, 194);
  setFont(doc, true, 10);
  setColor(doc, C.textPrimary);
  doc.text('MergeRSS Intelligence Engine', C.margin, 201);

  setFont(doc, false, 7);
  setColor(doc, C.textFaint);
  doc.text('GENERATED ON', C.margin + 88, 194);
  setFont(doc, true, 10);
  setColor(doc, C.textPrimary);
  doc.text(format(new Date(), 'MMMM d, yyyy'), C.margin + 88, 201);

  drawLine(doc, C.margin, 212, C.margin + C.col, 212, C.border, 0.3);

  setFont(doc, false, 7.5);
  setColor(doc, C.textFaint);
  const disc = 'This report was generated by an AI-powered analysis engine from curated digest data. Content is for informational purposes and reflects data available within the specified date range.';
  const discLines = doc.splitTextToSize(disc, C.col);
  discLines.forEach((l, i) => doc.text(l, C.margin, 219 + i * 4.5));

  // Bottom footer bar
  fillRect(doc, 0, C.pageH - 11, C.pageW, 11, C.cardBg2);
  drawLine(doc, 0, C.pageH - 11, C.pageW, C.pageH - 11, C.border, 0.3);
  setFont(doc, false, 7);
  setColor(doc, C.textFaint);
  doc.text('CONFIDENTIAL  \u00B7  MERGRESS INTELLIGENCE', C.margin, C.pageH - 4);
  doc.text('mergerss.com', C.pageW - C.margin, C.pageH - 4, { align: 'right' });
}

// ─── Key Takeaway Callout ─────────────────────────────────────────────────────
// Mirrors screen: border-l-4 border-primary, bg-stone-900, "KEY TAKEAWAY" label

function keyTakeawayBox(doc, y, summary) {
  const firstSentence = summary.split(/(?<=[.!?])\s+/)[0] || summary.slice(0, 300);
  const textMaxW = C.col - 14;
  setFont(doc, false, 9.5);
  const textLines = doc.splitTextToSize(firstSentence, textMaxW);
  const boxH = textLines.length * 5.2 + 18;

  // Dark bg (stone-900)
  fillRect(doc, C.margin, y, C.col, boxH, C.cardBg);
  // Left amber accent bar (4px = ~1.4mm at A4 scale)
  fillRect(doc, C.margin, y, 2.5, boxH, C.amber);
  // Subtle border
  strokeRect(doc, C.margin, y, C.col, boxH, C.border, 0.25);

  setFont(doc, true, 7);
  setColor(doc, C.amber);
  doc.text('KEY TAKEAWAY', C.margin + 8, y + 6.5);

  setFont(doc, false, 9.5);
  setColor(doc, C.textPrimary);
  textLines.forEach((l, i) => doc.text(l, C.margin + 8, y + 13.5 + i * 5.2));

  return y + boxH + 5;
}

// ─── Trajectory Pill ──────────────────────────────────────────────────────────

const TRAJ = {
  rising:    { label: 'Rising \u2191',     fg: C.emerald,  bg: C.emeraldBg },
  falling:   { label: 'Falling \u2193',    fg: C.red,      bg: C.redBg },
  stable:    { label: 'Stable \u2192',     fg: C.stone,    bg: [22, 18, 14] },
  volatile:  { label: 'Volatile',          fg: C.orange,   bg: C.orangeBg },
  peaked:    { label: 'Peaked',            fg: C.orange,   bg: C.orangeBg },
  resolving: { label: 'Resolving \u2198',  fg: C.blue,     bg: C.blueBg },
};

// Returns pill width
function trajPill(doc, x, y, trajectory) {
  const cfg = TRAJ[trajectory] || TRAJ.stable;
  setFont(doc, true, 7);
  const w = doc.getTextWidth(cfg.label) + 8;
  fillRect(doc, x, y - 4.5, w, 6.5, cfg.bg);
  setColor(doc, cfg.fg);
  doc.text(cfg.label, x + 4, y);
  return w;
}

// ─── Theme Card ───────────────────────────────────────────────────────────────
// Mirrors screen: numbered row, theme name, trajectory badge, full description below

function themeCard(doc, y, theme, index, state) {
  const numLabel = String(index + 1).padStart(2, '0');
  const textMaxW = C.col - 16;
  const descMaxW = C.col - 28;  // indented under number

  // Pre-measure title and description to size the card dynamically
  setFont(doc, true, 10.5);
  const titleLines = doc.splitTextToSize(theme.theme || '', C.col - 60);

  setFont(doc, false, 8.5);
  const descLines = doc.splitTextToSize(theme.description || '', descMaxW);

  // Card height: title block (min 14) + description + padding
  const titleH = Math.max(titleLines.length * 5.5, 8);
  const descH = descLines.length * 4.8;
  const cardH = titleH + descH + 20;

  // Ensure fits on page
  y = ensureSpace(doc, y, cardH + 4, state);

  // Top amber stripe (1.5mm) matching screen card structure
  fillRect(doc, C.margin, y, C.col, 1.5, [40, 32, 8]);
  // Card background
  fillRect(doc, C.margin, y + 1.5, C.col, cardH - 1.5, C.cardBg);
  // Left subtle border
  strokeRect(doc, C.margin, y, C.col, cardH, C.border, 0.25);

  // Row number — top left, muted amber
  setFont(doc, true, 7);
  setColor(doc, C.textFaint);
  doc.text(numLabel, C.margin + 5, y + 9);

  // Theme title — bold, white
  setFont(doc, true, 10.5);
  setColor(doc, C.white);
  const titleX = C.margin + 14;
  const titleY = y + 9;
  titleLines.forEach((l, li) => doc.text(l, titleX, titleY + li * 5.5));

  // Trajectory pill — right-aligned, same row as title
  const pillX = C.margin + C.col - 4;
  // measure pill width first
  const cfg = TRAJ[theme.trajectory] || TRAJ.stable;
  setFont(doc, true, 7);
  const pillW = doc.getTextWidth(cfg.label) + 8;
  const pX = pillX - pillW;
  fillRect(doc, pX, y + 4, pillW, 6.5, cfg.bg);
  setColor(doc, cfg.fg);
  doc.text(cfg.label, pX + 4, y + 9);

  // Description — below title, indented, muted text color
  const descY = titleY + titleH + 2;
  setFont(doc, false, 8.5);
  setColor(doc, C.textMuted);
  descLines.forEach((l, li) => doc.text(l, titleX, descY + li * 4.8));

  return y + cardH + 3;
}

// ─── Inflection Point ─────────────────────────────────────────────────────────
// Mirrors screen: amber dot + vertical line, date label, event headline, significance

function inflectionPoint(doc, y, pt, isLast, state) {
  // Pre-measure to size
  setFont(doc, true, 10);
  const evLines = doc.splitTextToSize(pt.event || '', C.col - 18);
  setFont(doc, false, 8.5);
  const sigLines = doc.splitTextToSize(pt.significance || '', C.col - 18);

  const blockH = 7 + evLines.length * 5.5 + sigLines.length * 4.8 + 8;
  y = ensureSpace(doc, y, blockH + 6, state);

  const dotX = C.margin + 5;
  const dotY = y + 4;

  // Amber dot
  doc.setFillColor(...C.amber);
  doc.circle(dotX, dotY, 2.5, 'F');

  // Vertical connector (to next item, not beyond)
  if (!isLast) {
    drawLine(doc, dotX, dotY + 3, dotX, y + blockH + 5, C.border, 0.5);
  }

  const textX = C.margin + 14;

  // Date
  setFont(doc, true, 7.5);
  setColor(doc, C.amber);
  doc.text((pt.date || '').toUpperCase(), textX, y + 5);

  // Event headline
  setFont(doc, true, 10);
  setColor(doc, C.white);
  evLines.forEach((l, li) => doc.text(l, textX, y + 12 + li * 5.5));

  // Significance
  const sigY = y + 12 + evLines.length * 5.5 + 2;
  setFont(doc, false, 8.5);
  setColor(doc, C.textMuted);
  sigLines.forEach((l, li) => doc.text(l, textX, sigY + li * 4.8));

  return y + blockH + 4;
}

// ─── Outlook Signal Block ─────────────────────────────────────────────────────
// Mirrors screen: number badge (stone-800 bg + amber number), signal text

function outlookSignal(doc, y, signal, index, state) {
  setFont(doc, false, 9.5);
  const sLines = doc.splitTextToSize(signal.trim(), C.col - 14);
  const blockH = Math.max(sLines.length * 5.2, 8) + 6;

  y = ensureSpace(doc, y, blockH, state);

  // Number badge — dark background, amber number text
  fillRect(doc, C.margin, y, 7, 7, C.cardBg2);
  strokeRect(doc, C.margin, y, 7, 7, C.border, 0.3);
  setFont(doc, true, 7);
  setColor(doc, C.amber);  // amber on dark — matches screen
  doc.text(String(index + 1), C.margin + 1.8, y + 5.2);

  // Signal text
  setFont(doc, false, 9.5);
  setColor(doc, C.textPrimary);
  sLines.forEach((l, li) => doc.text(l, C.margin + 12, y + 5 + li * 5.2));

  return y + blockH;
}

// ─── Data Summary Block ───────────────────────────────────────────────────────
// Mirrors screen footer: 3 stat pills in a dark panel

function dataSummaryBlock(doc, y, dataSummary, deliveryCount, startDate, endDate) {
  const panelH = 28;
  fillRect(doc, C.margin, y, C.col, panelH, C.cardBg2);
  strokeRect(doc, C.margin, y, C.col, panelH, C.border, 0.3);

  const stats = [
    { label: 'ISSUES ANALYZED', val: String(dataSummary.digest_count || deliveryCount || '—') },
    { label: 'DATE RANGE',      val: dataSummary.date_range || `${startDate} – ${endDate}` },
    { label: 'MOST ACTIVE',     val: dataSummary.most_active_period || '—' },
  ];

  const cellW = Math.floor(C.col / 3);
  stats.forEach(({ label, val }, ci) => {
    const x = C.margin + ci * cellW + 5;
    // Divider between cells
    if (ci > 0) drawLine(doc, C.margin + ci * cellW, y + 4, C.margin + ci * cellW, y + panelH - 4, C.border, 0.3);

    setFont(doc, false, 7);
    setColor(doc, C.textFaint);
    doc.text(label, x, y + 8);

    setFont(doc, true, 9.5);
    setColor(doc, C.textPrimary);
    const vLines = doc.splitTextToSize(val, cellW - 8);
    vLines.slice(0, 2).forEach((l, li) => doc.text(l, x, y + 15 + li * 5));
  });

  return y + panelH + 4;
}

// ─── Warning / Range Mismatch Banner ─────────────────────────────────────────

function warningBanner(doc, y, text) {
  setFont(doc, false, 8.5);
  const textLines = doc.splitTextToSize(text, C.col - 12);
  const bannerH = textLines.length * 4.8 + 12;

  // Amber-tinted dark background + amber left bar
  fillRect(doc, C.margin, y, C.col, bannerH, [30, 22, 4]);
  fillRect(doc, C.margin, y, 2.5, bannerH, [180, 130, 20]);
  strokeRect(doc, C.margin, y, C.col, bannerH, [80, 60, 10], 0.3);

  // Warning symbol
  setFont(doc, true, 8);
  setColor(doc, C.amber);
  doc.text('\u26A0', C.margin + 6, y + bannerH / 2 + 2);

  setFont(doc, false, 8.5);
  setColor(doc, [200, 180, 100]);
  textLines.forEach((l, i) => doc.text(l, C.margin + 13, y + 7 + i * 4.8));

  return y + bannerH + 4;
}

// ─── Section divider ─────────────────────────────────────────────────────────

function sectionDivider(doc, y) {
  drawLine(doc, C.margin, y, C.margin + C.col, y, C.border, 0.4);
  return y + 10;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generatePremiumPdf(savedReport) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const r = savedReport.report || {};
  const digestName = savedReport.digest_name || 'Intelligence Report';
  const startDate = savedReport.start_date;
  const endDate = savedReport.end_date;
  const deliveryCount = savedReport.delivery_count || 0;
  const actualStart = savedReport.actual_start;
  const actualEnd = savedReport.actual_end;
  const requestedStart = savedReport.start_date;
  const requestedEnd = savedReport.end_date;

  // ── COVER PAGE ────────────────────────────────────────────────────────────
  buildCoverPage(doc, digestName, startDate, endDate, deliveryCount);

  // ── PAGE 2 START ──────────────────────────────────────────────────────────
  doc.addPage();
  const state = { page: 2 };
  fillRect(doc, 0, 0, C.pageW, C.pageH, C.pageBg);
  addFooter(doc, state.page);

  let y = 18;

  // ── RANGE MISMATCH WARNING ────────────────────────────────────────────────
  // Mirrors the amber callout at the top of the screen report header
  const rangeDiffers = requestedStart && requestedEnd && actualStart && actualEnd &&
    (requestedStart !== actualStart || requestedEnd !== actualEnd);
  if (rangeDiffers) {
    let displayStart = '—', displayEnd = '—';
    try { displayStart = format(new Date(actualStart), 'MMM d, yyyy'); } catch {}
    try { displayEnd = format(new Date(actualEnd), 'MMM d, yyyy'); } catch {}
    y = warningBanner(doc, y,
      `Data available ${displayStart} – ${displayEnd} only. Report is based on available issues within the requested range.`
    );
    y += 2;
  }

  // ── 01 EXECUTIVE SUMMARY ──────────────────────────────────────────────────
  // Primary section: amber bar background matching screen
  y = sectionHeader(doc, y, '01', 'EXECUTIVE SUMMARY', true);
  y += 2;

  if (r.executive_summary) {
    // Key Takeaway callout — mirrors screen border-l-4 card
    y = ensureSpace(doc, y, 30, state);
    y = keyTakeawayBox(doc, y, r.executive_summary);
    y += 5;

    // Body paragraphs — full text, not truncated
    const paras = r.executive_summary.split(/\n+/).filter(p => p.trim());
    for (const para of paras) {
      setFont(doc, false, 9.5);
      const pLines = doc.splitTextToSize(para, C.col);
      const pH = pLines.length * 5.2 + 4;
      y = ensureSpace(doc, y, pH, state);
      y = writeText(doc, para, C.margin, y, { size: 9.5, color: C.textSub, maxW: C.col, lineH: 5.2 });
      y += 3;
    }
  }

  y += 2;
  y = sectionDivider(doc, y);

  // ── 02 KEY THEMES ─────────────────────────────────────────────────────────
  if (r.key_themes?.length > 0) {
    y = ensureSpace(doc, y, 18, state);
    y = sectionHeader(doc, y, '02', 'KEY THEMES & EVOLUTION');
    y += 2;

    for (let i = 0; i < r.key_themes.length; i++) {
      y = themeCard(doc, y, r.key_themes[i], i, state);
    }

    y += 2;
    y = sectionDivider(doc, y);
  }

  // ── 03 TREND TRAJECTORIES ─────────────────────────────────────────────────
  const hasTraj = r.escalating_topics?.length || r.deescalating_topics?.length || r.cyclical_topics?.length;
  if (hasTraj) {
    y = ensureSpace(doc, y, 18, state);
    y = sectionHeader(doc, y, '03', 'TREND TRAJECTORIES');
    y += 2;

    const colDefs = [
      { items: r.escalating_topics   || [], label: 'ESCALATING \u2191',    fg: C.emerald, hdrBg: [6, 35, 20],  bodyBg: C.emeraldBg },
      { items: r.deescalating_topics || [], label: 'DE-ESCALATING \u2193', fg: C.blue,    hdrBg: [8, 22, 55],  bodyBg: C.blueBg },
      { items: r.cyclical_topics     || [], label: 'CYCLICAL \u26A1',      fg: C.orange,  hdrBg: [40, 20, 4],  bodyBg: C.orangeBg },
    ];

    const activeCols = colDefs.filter(c => c.items.length > 0);
    const numCols = activeCols.length || 1;
    const gutter = 4;
    const colW = Math.floor((C.col - gutter * (numCols - 1)) / numCols);
    const maxItems = Math.max(...activeCols.map(c => c.items.length), 1);

    // Calculate height needed for the tallest column
    let maxColH = 10; // header height
    for (const col of activeCols) {
      setFont(doc, false, 8.5);
      let colContentH = 10; // header
      for (const item of col.items.slice(0, 10)) {
        const ls = doc.splitTextToSize(`\u2022 ${item}`, colW - 8);
        colContentH += ls.length * 4.8 + 2;
      }
      colContentH += 6; // padding
      if (colContentH > maxColH) maxColH = colContentH;
    }

    y = ensureSpace(doc, y, maxColH + 6, state);

    activeCols.forEach((col, ci) => {
      const x = C.margin + ci * (colW + gutter);

      // Column header
      fillRect(doc, x, y, colW, 10, col.hdrBg);
      setFont(doc, true, 7.5);
      setColor(doc, col.fg);
      doc.text(col.label, x + 4, y + 7);

      // Column body background
      fillRect(doc, x, y + 10, colW, maxColH - 10, col.bodyBg);
      strokeRect(doc, x, y, colW, maxColH, C.border, 0.25);

      // Items
      setFont(doc, false, 8.5);
      setColor(doc, C.textPrimary);
      let itemY = y + 18;
      col.items.slice(0, 10).forEach(item => {
        const itemLines = doc.splitTextToSize(`\u2022 ${item}`, colW - 8);
        itemLines.forEach(l => {
          if (itemY < y + maxColH - 2) {
            doc.text(l, x + 4, itemY);
            itemY += 4.8;
          }
        });
        itemY += 1.5;
      });
    });

    y += maxColH + 6;
    y = sectionDivider(doc, y);
  }

  // ── 04 INFLECTION POINTS ──────────────────────────────────────────────────
  if (r.inflection_points?.length > 0) {
    y = ensureSpace(doc, y, 24, state);
    y = sectionHeader(doc, y, '04', 'INFLECTION POINTS');
    y += 4;

    for (let i = 0; i < r.inflection_points.length; i++) {
      y = inflectionPoint(doc, y, r.inflection_points[i], i === r.inflection_points.length - 1, state);
    }

    y += 2;
    y = sectionDivider(doc, y);
  }

  // ── 05 OUTLOOK & FORWARD SIGNALS ─────────────────────────────────────────
  if (r.outlook) {
    y = ensureSpace(doc, y, 24, state);
    y = sectionHeader(doc, y, '05', 'OUTLOOK & FORWARD SIGNALS');
    y += 4;

    const signals = r.outlook.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 8);
    for (let i = 0; i < signals.length; i++) {
      y = outlookSignal(doc, y, signals[i], i, state);
    }

    y += 2;
    y = sectionDivider(doc, y);
  }

  // ── 06 DATA SUMMARY ───────────────────────────────────────────────────────
  if (r.data_summary) {
    y = ensureSpace(doc, y, 40, state);
    y = sectionHeader(doc, y, '06', 'DATA SUMMARY');
    y += 4;
    y = dataSummaryBlock(doc, y, r.data_summary, deliveryCount, startDate, endDate);
  }

  // ── BACK PAGE ─────────────────────────────────────────────────────────────
  doc.addPage();
  state.page++;
  fillRect(doc, 0, 0, C.pageW, C.pageH, C.pageBg);
  addFooter(doc, state.page);

  const cx = C.pageW / 2;
  const cy = C.pageH / 2 - 20;

  fillRect(doc, cx - 11, cy - 11, 22, 22, C.amber);
  setFont(doc, true, 13);
  setColor(doc, [10, 8, 5]);
  doc.text('M', cx - 3.5, cy + 4);

  setFont(doc, true, 16);
  setColor(doc, C.white);
  doc.text('MergeRSS', cx, cy + 20, { align: 'center' });

  setFont(doc, false, 9);
  setColor(doc, C.textMuted);
  doc.text('Intelligence. Curated.', cx, cy + 29, { align: 'center' });

  drawLine(doc, cx - 30, cy + 36, cx + 30, cy + 36, C.borderLight, 0.4);

  setFont(doc, false, 8);
  setColor(doc, C.textFaint);
  doc.text('mergerss.com', cx, cy + 44, { align: 'center' });

  // ── SAVE ──────────────────────────────────────────────────────────────────
  let safeName = digestName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  let safeDate = startDate ? startDate.slice(0, 10) : 'report';
  const filename = `${safeName}-report-${safeDate}.pdf`;
  doc.save(filename);
}
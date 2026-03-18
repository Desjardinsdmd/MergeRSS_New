import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Dark theme matching the app's stone/amber palette
const C = {
  // Backgrounds
  pageBg:      [10, 8, 5],        // #0a0805 — deepest app bg
  cardBg:      [20, 16, 10],      // stone-900 equiv
  cardBg2:     [15, 12, 8],       // slightly lighter card
  sectionBg:   [26, 22, 14],      // stone-800 equiv

  // Amber brand
  amber:       [251, 191, 36],    // primary brand
  amberDark:   [180, 130, 20],    // darker amber for backgrounds
  amberBg:     [40, 30, 5],       // very dark amber tint for boxes

  // Text
  white:       [255, 255, 255],
  textPrimary: [230, 220, 205],   // stone-200 equiv — main body
  textMuted:   [140, 130, 118],   // stone-500 equiv
  textFaint:   [80, 74, 66],      // stone-700 equiv

  // Borders / dividers
  border:      [38, 32, 22],      // stone-800
  borderLight: [55, 46, 32],      // stone-700

  // Trajectory colors (kept visible on dark)
  emerald:     [52, 211, 153],    // emerald-400
  emeraldBg:   [6, 35, 22],
  red:         [248, 113, 113],   // red-400
  redBg:       [35, 8, 8],
  blue:        [96, 165, 250],    // blue-400
  blueBg:      [8, 22, 50],
  orange:      [251, 146, 60],    // orange-400
  orangeBg:    [35, 18, 4],
  stone:       [120, 113, 108],   // stone-500

  // Page geometry
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

function drawLine(doc, x1, y1, x2, y2, color, width = 0.3) {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(x1, y1, x2, y2);
}

// Write text, return new Y. No charSpace manipulation.
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

function needsPage(doc, y, needed, state) {
  if (y + needed > C.pageH - 14) {
    doc.addPage();
    state.page++;
    fillRect(doc, 0, 0, C.pageW, C.pageH, C.pageBg);
    addFooter(doc, state.page);
    return 20;
  }
  return y;
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function addFooter(doc, pageNum) {
  const y = C.pageH - 9;
  fillRect(doc, 0, C.pageH - 10, C.pageW, 10, C.sectionBg);
  drawLine(doc, 0, C.pageH - 10, C.pageW, C.pageH - 10, C.border);
  setFont(doc, false, 7);
  setColor(doc, C.textFaint);
  doc.text('MergeRSS Intelligence Report  ·  Confidential', C.margin, y);
  doc.text(String(pageNum), C.pageW - C.margin, y, { align: 'right' });
}

// ─── Section header bar ───────────────────────────────────────────────────────

function sectionHeader(doc, y, num, label) {
  fillRect(doc, 0, y, C.pageW, 10, C.amberDark);
  setFont(doc, true, 8);
  setColor(doc, C.amber);
  doc.text(`${num}  —  ${label}`, C.margin, y + 7);
  return y + 14;
}

// ─── COVER PAGE ───────────────────────────────────────────────────────────────

function buildCoverPage(doc, digestName, startDate, endDate, deliveryCount) {
  // Full black background
  fillRect(doc, 0, 0, C.pageW, C.pageH, C.pageBg);

  // Top amber accent stripe
  fillRect(doc, 0, 0, C.pageW, 2, C.amber);

  // Brand mark box
  fillRect(doc, C.margin, 14, 14, 14, C.amber);
  setFont(doc, true, 9);
  setColor(doc, [10, 8, 5]);
  doc.text('M', C.margin + 4.5, 24);

  setFont(doc, true, 10);
  setColor(doc, C.white);
  doc.text('MergeRSS', C.margin + 18, 24);

  // Intelligence Report label — NO charSpace (causes jumble in some renderers)
  setFont(doc, false, 7);
  setColor(doc, C.textMuted);
  doc.text('INTELLIGENCE REPORT', C.margin, 52);

  // Thin divider
  drawLine(doc, C.margin, 56, C.margin + C.col, 56, C.border, 0.4);

  // Digest name — large, bold, white
  setFont(doc, true, 28);
  setColor(doc, C.white);
  const titleLines = doc.splitTextToSize(digestName.toUpperCase(), C.col);
  let ty = 72;
  titleLines.slice(0, 3).forEach(l => {
    doc.text(l, C.margin, ty);
    ty += 13;
  });

  // Subtitle
  setFont(doc, false, 12);
  setColor(doc, C.amber);
  doc.text('Trend & Intelligence Report', C.margin, ty + 4);

  // Date range
  const dateStr = `${format(new Date(startDate), 'MMMM d, yyyy')} \u2013 ${format(new Date(endDate), 'MMMM d, yyyy')}`;
  setFont(doc, false, 9);
  setColor(doc, C.textMuted);
  doc.text(dateStr, C.margin, 152);

  // Issue count
  setFont(doc, true, 22);
  setColor(doc, C.amber);
  doc.text(String(deliveryCount), C.margin, 168);
  setFont(doc, false, 8);
  setColor(doc, C.textMuted);
  doc.text('DIGEST ISSUES ANALYZED', C.margin + 18, 168);

  // Amber divider before metadata
  drawLine(doc, 0, 182, C.pageW, 182, C.amberDark, 1.5);

  // Metadata block — slightly lighter bg
  fillRect(doc, 0, 182, C.pageW, 60, C.cardBg);

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
  const disc = 'This report was generated by an AI-powered analysis engine from curated digest data.\nContent is for informational purposes and reflects data available within the specified date range.';
  const discLines = doc.splitTextToSize(disc, C.col);
  discLines.forEach((l, i) => doc.text(l, C.margin, 219 + i * 4.5));

  // Bottom footer bar
  fillRect(doc, 0, C.pageH - 10, C.pageW, 10, C.sectionBg);
  drawLine(doc, 0, C.pageH - 10, C.pageW, C.pageH - 10, C.border, 0.3);
  setFont(doc, false, 7);
  setColor(doc, C.textFaint);
  doc.text('CONFIDENTIAL  \u00B7  MERGRESS INTELLIGENCE', C.margin, C.pageH - 4);
  doc.text('mergerss.com', C.pageW - C.margin, C.pageH - 4, { align: 'right' });
}

// ─── Key Takeaway Box ─────────────────────────────────────────────────────────

function keyTakeawayBox(doc, y, summary) {
  const firstSentence = summary.split(/(?<=[.!?])\s+/)[0] || summary.slice(0, 200);
  const textLines = doc.splitTextToSize(firstSentence, C.col - 10);
  const boxH = Math.max(textLines.length * 5 + 16, 22);

  // Dark amber tinted box with amber left border
  fillRect(doc, C.margin, y, C.col, boxH, C.amberBg);
  fillRect(doc, C.margin, y, 3, boxH, C.amber);  // left accent bar

  setFont(doc, true, 7);
  setColor(doc, C.amber);
  doc.text('KEY TAKEAWAY', C.margin + 7, y + 6);

  setFont(doc, false, 9);
  setColor(doc, C.textPrimary);
  textLines.forEach((l, i) => doc.text(l, C.margin + 7, y + 13 + i * 5));

  return y + boxH + 4;
}

// ─── Trajectory Pill ─────────────────────────────────────────────────────────

const TRAJ = {
  rising:    { label: 'Rising \u2191',     fg: C.emerald,  bg: C.emeraldBg },
  falling:   { label: 'Falling \u2193',    fg: C.red,      bg: C.redBg },
  stable:    { label: 'Stable \u2192',     fg: C.stone,    bg: [22, 18, 14] },
  volatile:  { label: 'Volatile',          fg: C.orange,   bg: C.orangeBg },
  peaked:    { label: 'Peaked',            fg: C.orange,   bg: C.orangeBg },
  resolving: { label: 'Resolving \u2198',  fg: C.blue,     bg: C.blueBg },
};

function trajPill(doc, x, y, trajectory) {
  const cfg = TRAJ[trajectory] || TRAJ.stable;
  setFont(doc, true, 7);
  // measure text without rendering
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const w = doc.getTextWidth(cfg.label) + 8;
  fillRect(doc, x, y - 4.5, w, 6.5, cfg.bg);
  setColor(doc, cfg.fg);
  doc.text(cfg.label, x + 4, y);
  return w;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generatePremiumPdf(savedReport) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const r = savedReport.report || {};
  const digestName = savedReport.digest_name || 'Intelligence Report';
  const startDate = savedReport.start_date;
  const endDate = savedReport.end_date;
  const deliveryCount = savedReport.delivery_count || 0;

  // ── COVER PAGE ────────────────────────────────────────────────────────────
  buildCoverPage(doc, digestName, startDate, endDate, deliveryCount);

  // ── PAGE 2 ────────────────────────────────────────────────────────────────
  doc.addPage();
  const state = { page: 2 };
  fillRect(doc, 0, 0, C.pageW, C.pageH, C.pageBg);
  addFooter(doc, state.page);

  let y = 18;

  const np = (space) => {
    y = needsPage(doc, y, space, state);
  };

  // ── 01 EXECUTIVE SUMMARY ─────────────────────────────────────────────────
  y = sectionHeader(doc, y, '01', 'EXECUTIVE SUMMARY');

  if (r.executive_summary) {
    np(30);
    y = keyTakeawayBox(doc, y, r.executive_summary);
    y += 4;

    // Body — split into paragraphs
    const paras = r.executive_summary.split(/\n+/).filter(p => p.trim());
    paras.forEach(para => {
      np(18);
      y = writeText(doc, para, C.margin, y, {
        size: 9.5,
        color: C.textPrimary,
        maxW: C.col,
        lineH: 5,
      });
      y += 3;
    });
  }

  y += 4;
  drawLine(doc, C.margin, y, C.margin + C.col, y, C.border);
  y += 10;

  // ── 02 KEY THEMES ─────────────────────────────────────────────────────────
  if (r.key_themes?.length > 0) {
    np(24);
    y = sectionHeader(doc, y, '02', 'KEY THEMES & EVOLUTION');

    r.key_themes.forEach((theme, i) => {
      np(40);

      // Card: top amber stripe + dark card bg
      fillRect(doc, C.margin, y, C.col, 1.5, C.amber);
      fillRect(doc, C.margin, y + 1.5, C.col, 37, C.cardBg);

      // Theme number
      setFont(doc, true, 7);
      setColor(doc, C.amber);
      doc.text(`THEME ${String(i + 1).padStart(2, '0')}`, C.margin + 4, y + 8);

      // Title
      setFont(doc, true, 11);
      setColor(doc, C.white);
      const tLines = doc.splitTextToSize(theme.theme, C.col - 48);
      tLines.slice(0, 2).forEach((l, li) => doc.text(l, C.margin + 4, y + 16 + li * 6));

      // Trajectory pill — right aligned
      const pillW = (() => {
        const cfg = TRAJ[theme.trajectory] || TRAJ.stable;
        setFont(doc, true, 7);
        const w = doc.getTextWidth(cfg.label) + 8;
        const px = C.margin + C.col - w - 4;
        fillRect(doc, px, y + 5, w, 6.5, cfg.bg);
        setColor(doc, cfg.fg);
        doc.text(cfg.label, px + 4, y + 10);
        return w;
      })();

      // Description (capped at 3 lines to fit card)
      setFont(doc, false, 8.5);
      setColor(doc, C.textMuted);
      const descLines = doc.splitTextToSize(theme.description || '', C.col - 8);
      const descStartY = y + 16 + Math.min(tLines.length, 2) * 6 + 2;
      descLines.slice(0, 3).forEach((l, li) => {
        const lineY = descStartY + li * 4.5;
        if (lineY < y + 37) doc.text(l, C.margin + 4, lineY);
      });

      y += 42;
    });

    y += 4;
    drawLine(doc, C.margin, y, C.margin + C.col, y, C.border);
    y += 10;
  }

  // ── 03 TREND TRAJECTORIES ─────────────────────────────────────────────────
  const hasTraj = r.escalating_topics?.length || r.deescalating_topics?.length || r.cyclical_topics?.length;
  if (hasTraj) {
    np(24);
    y = sectionHeader(doc, y, '03', 'TREND TRAJECTORIES');

    // 3-column layout — each column independent, stacked list
    const colW = Math.floor((C.col - 8) / 3);
    const cols = [
      { items: r.escalating_topics || [],    label: 'ESCALATING \u2191',    fg: C.emerald,  bg: C.emeraldBg,  hdr: [6, 50, 30] },
      { items: r.deescalating_topics || [],  label: 'DE-ESCALATING \u2193', fg: C.blue,     bg: C.blueBg,     hdr: [10, 30, 70] },
      { items: r.cyclical_topics || [],      label: 'CYCLICAL',             fg: C.orange,   bg: C.orangeBg,   hdr: [50, 28, 6] },
    ];

    const maxItems = Math.max(...cols.map(c => c.items.length), 1);
    const boxH = maxItems * 6 + 18;

    cols.forEach((col, ci) => {
      if (!col.items.length) return;
      const x = C.margin + ci * (colW + 4);

      // Header
      fillRect(doc, x, y, colW, 9, col.hdr);
      setFont(doc, true, 7);
      setColor(doc, col.fg);
      doc.text(col.label, x + 3, y + 6.5);

      // Body
      fillRect(doc, x, y + 9, colW, boxH - 9, col.bg);
      setFont(doc, false, 8);
      setColor(doc, C.textPrimary);

      col.items.slice(0, 8).forEach((item, ii) => {
        const lineY = y + 17 + ii * 6;
        const itemLines = doc.splitTextToSize(`\u2022 ${item}`, colW - 4);
        itemLines.slice(0, 1).forEach(l => doc.text(l, x + 3, lineY));
      });
    });

    y += boxH + 10;
    drawLine(doc, C.margin, y, C.margin + C.col, y, C.border);
    y += 10;
  }

  // ── 04 INFLECTION POINTS ──────────────────────────────────────────────────
  if (r.inflection_points?.length > 0) {
    np(30);
    y = sectionHeader(doc, y, '04', 'SIGNIFICANT INFLECTION POINTS');

    r.inflection_points.forEach((pt, i) => {
      np(28);

      // Amber dot
      doc.setFillColor(...C.amber);
      doc.circle(C.margin + 4, y + 4, 2.5, 'F');

      // Vertical connector line (except last)
      if (i < r.inflection_points.length - 1) {
        drawLine(doc, C.margin + 4, y + 7, C.margin + 4, y + 30, C.border, 0.5);
      }

      // Date
      setFont(doc, true, 8);
      setColor(doc, C.amber);
      doc.text(pt.date || '', C.margin + 12, y + 5);

      // Event headline
      setFont(doc, true, 10);
      setColor(doc, C.white);
      const evLines = doc.splitTextToSize(pt.event || '', C.col - 16);
      evLines.slice(0, 2).forEach((l, li) => doc.text(l, C.margin + 12, y + 11 + li * 5.5));

      // Significance
      setFont(doc, false, 8.5);
      setColor(doc, C.textMuted);
      const sigLines = doc.splitTextToSize(pt.significance || '', C.col - 16);
      const sigY = y + 11 + Math.min(evLines.length, 2) * 5.5 + 2;
      sigLines.slice(0, 3).forEach((l, li) => doc.text(l, C.margin + 12, sigY + li * 4.5));

      y += 32;
    });

    y += 4;
    drawLine(doc, C.margin, y, C.margin + C.col, y, C.border);
    y += 10;
  }

  // ── 05 OUTLOOK ────────────────────────────────────────────────────────────
  if (r.outlook) {
    np(24);
    y = sectionHeader(doc, y, '05', 'OUTLOOK & FORWARD SIGNALS');

    const signals = r.outlook.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 8);
    signals.slice(0, 8).forEach((signal, i) => {
      np(16);

      // Number box
      fillRect(doc, C.margin, y - 1, 7, 7, C.amberDark);
      setFont(doc, true, 7);
      setColor(doc, [10, 8, 5]);
      doc.text(String(i + 1), C.margin + 1.8, y + 4.5);

      // Signal text
      setFont(doc, false, 9.5);
      setColor(doc, C.textPrimary);
      const sLines = doc.splitTextToSize(signal.trim(), C.col - 12);
      sLines.forEach((l, li) => doc.text(l, C.margin + 11, y + li * 5));
      y += Math.max(sLines.length * 5 + 2, 10) + 4;
    });

    y += 4;
    drawLine(doc, C.margin, y, C.margin + C.col, y, C.border);
    y += 10;
  }

  // ── 06 DATA SUMMARY ───────────────────────────────────────────────────────
  if (r.data_summary) {
    np(36);
    y = sectionHeader(doc, y, '06', 'DATA SUMMARY');

    fillRect(doc, C.margin, y, C.col, 30, C.cardBg);

    const items = [
      ['DIGESTS ANALYZED', String(r.data_summary.digest_count || deliveryCount)],
      ['DATE RANGE',        r.data_summary.date_range || `${startDate} \u2013 ${endDate}`],
      ['MOST ACTIVE',       r.data_summary.most_active_period || '\u2014'],
    ];

    items.forEach(([label, val], ci) => {
      const x = C.margin + 4 + ci * 60;
      setFont(doc, false, 7);
      setColor(doc, C.textFaint);
      doc.text(label, x, y + 7);
      setFont(doc, true, 10);
      setColor(doc, C.textPrimary);
      const vLines = doc.splitTextToSize(val, 56);
      vLines.slice(0, 3).forEach((l, li) => doc.text(l, x, y + 14 + li * 5));
    });

    y += 34;
  }

  // ── BACK PAGE ─────────────────────────────────────────────────────────────
  doc.addPage();
  state.page++;
  fillRect(doc, 0, 0, C.pageW, C.pageH, C.pageBg);
  addFooter(doc, state.page);

  // Centered branding
  const cx = C.pageW / 2;
  const cy = C.pageH / 2 - 20;

  fillRect(doc, cx - 10, cy - 10, 20, 20, C.amber);
  setFont(doc, true, 13);
  setColor(doc, [10, 8, 5]);
  doc.text('M', cx - 3.5, cy + 4);

  setFont(doc, true, 16);
  setColor(doc, C.white);
  doc.text('MergeRSS', cx, cy + 18, { align: 'center' });

  setFont(doc, false, 9);
  setColor(doc, C.textMuted);
  doc.text('Intelligence. Curated.', cx, cy + 27, { align: 'center' });

  drawLine(doc, cx - 28, cy + 34, cx + 28, cy + 34, C.borderLight, 0.4);

  setFont(doc, false, 8);
  setColor(doc, C.textFaint);
  doc.text('mergerss.com', cx, cy + 42, { align: 'center' });

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const filename = `${(digestName).replace(/[^a-z0-9]/gi, '-').toLowerCase()}-report-${startDate}.pdf`;
  doc.save(filename);
}
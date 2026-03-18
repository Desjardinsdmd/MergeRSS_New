import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  // Colors
  white:       [255, 255, 255],
  offWhite:    [248, 246, 242],
  lightGray:   [237, 234, 228],
  midGray:     [180, 175, 168],
  darkGray:    [110, 104, 96],
  charcoal:    [34, 28, 20],
  black:       [10, 8, 5],
  amber:       [214, 158, 20],       // brand primary (print-safe darker amber)
  amberLight:  [251, 191, 36],
  amberFaint:  [253, 246, 220],
  emerald:     [16, 128, 96],
  emeraldFaint:[236, 252, 244],
  red:         [185, 50, 40],
  redFaint:    [254, 242, 242],
  blue:        [30, 100, 200],
  blueFaint:   [239, 246, 255],
  slateLight:  [245, 243, 240],

  // Page geometry
  pageW:  210,
  pageH:  297,
  margin: 18,
  col:    174,   // pageW - margin*2
};

// Accent swatch for trajectories
const TRAJ = {
  rising:    { label: 'Rising ↑',    fg: [16, 128, 96],  bg: [236, 252, 244] },
  falling:   { label: 'Falling ↓',   fg: [185, 50, 40],  bg: [254, 242, 242] },
  stable:    { label: 'Stable →',    fg: [110, 104, 96], bg: [237, 234, 228] },
  volatile:  { label: 'Volatile ⚡', fg: [161, 98, 7],   bg: [255, 247, 229] },
  peaked:    { label: 'Peaked ◆',    fg: [124, 77, 14],  bg: [255, 243, 199] },
  resolving: { label: 'Resolving ↘', fg: [30, 100, 200], bg: [239, 246, 255] },
};

// ─── Low-level helpers ────────────────────────────────────────────────────────
function rgb(doc, color) { doc.setTextColor(...color); }
function fill(doc, color) { doc.setFillColor(...color); }
function stroke(doc, color) { doc.setDrawColor(...color); }
function font(doc, style = 'normal', size = 10) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
}

// Draw a filled rect
function rect(doc, x, y, w, h, color) {
  fill(doc, color);
  doc.rect(x, y, w, h, 'F');
}

// Draw a horizontal rule
function hr(doc, y, color = T.lightGray, x = T.margin, w = T.col) {
  stroke(doc, color);
  doc.setLineWidth(0.25);
  doc.line(x, y, x + w, y);
}

// Wrap + print text, return final Y
function text(doc, str, x, y, opts = {}) {
  const {
    size = 10,
    color = T.charcoal,
    bold = false,
    italic = false,
    align = 'left',
    maxW,
    lineH,
  } = opts;
  font(doc, italic ? 'italic' : bold ? 'bold' : 'normal', size);
  rgb(doc, color);
  const w = maxW || T.col;
  const lh = lineH || size * 0.42;
  const lines = doc.splitTextToSize(String(str || ''), w);
  lines.forEach(line => {
    const xPos = align === 'right' ? x + w : align === 'center' ? x + w / 2 : x;
    doc.text(line, xPos, y, { align });
    y += lh;
  });
  return y;
}

// Ensure there's enough vertical space; add page if not
function ensureSpace(doc, y, needed) {
  if (y + needed > T.pageH - 16) {
    doc.addPage();
    return 22;
  }
  return y;
}

// ─── Structural blocks ────────────────────────────────────────────────────────

// Section label (e.g. "02 — KEY THEMES")
function sectionLabel(doc, y, num, label) {
  y = ensureSpace(doc, y, 20);
  rect(doc, T.margin, y, T.col, 10, T.amber);
  font(doc, 'bold', 8);
  doc.setTextColor(...T.black);
  doc.text(`${num}  —  ${label.toUpperCase()}`, T.margin + 4, y + 6.5);
  return y + 14;
}

// Key takeaway box (amber-tinted)
function takeawayBox(doc, y, summary) {
  // Extract first sentence as key takeaway
  const firstSentence = summary.split(/(?<=[.!?])\s+/)[0] || summary.slice(0, 180);
  y = ensureSpace(doc, y, 28);
  rect(doc, T.margin, y, T.col, 22, T.amberFaint);
  stroke(doc, T.amber);
  doc.setLineWidth(0.6);
  doc.rect(T.margin, y, T.col, 22, 'S');
  // Label
  font(doc, 'bold', 7);
  rgb(doc, T.amber);
  doc.text('KEY TAKEAWAY', T.margin + 4, y + 5.5);
  // Text
  font(doc, 'normal', 9);
  rgb(doc, [100, 70, 0]);
  const lines = doc.splitTextToSize(firstSentence, T.col - 8);
  lines.slice(0, 2).forEach((l, i) => doc.text(l, T.margin + 4, y + 11 + i * 4.5));
  return y + 26;
}

// Theme trajectory pill
function trajectoryPill(doc, x, y, trajectory) {
  const cfg = TRAJ[trajectory] || TRAJ.stable;
  const label = cfg.label;
  font(doc, 'bold', 7);
  const w = doc.getTextWidth(label) + 6;
  rect(doc, x, y - 4, w, 6, cfg.bg);
  rgb(doc, cfg.fg);
  doc.text(label, x + 3, y);
  return w;
}

// Inline image embed (async – fetches URL, converts to data URL)
async function embedImage(doc, url, x, y, w, h) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    doc.addImage(dataUrl, 'JPEG', x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

// ─── Page builders ────────────────────────────────────────────────────────────

// COVER PAGE
function buildCoverPage(doc, digestName, startDate, endDate, deliveryCount) {
  // Dark background panel (top 60%)
  rect(doc, 0, 0, T.pageW, 175, T.black);

  // Amber accent bar
  rect(doc, 0, 175, T.pageW, 3, T.amber);

  // Brand mark (top-left)
  rect(doc, T.margin, 14, 18, 18, T.amber);
  font(doc, 'bold', 11);
  rgb(doc, T.black);
  doc.text('M', T.margin + 5.5, 26);

  font(doc, 'bold', 10);
  rgb(doc, T.white);
  doc.text('MergeRSS', T.margin + 23, 26);

  // INTELLIGENCE REPORT label
  font(doc, 'normal', 7);
  rgb(doc, T.midGray);
  doc.text('INTELLIGENCE REPORT', T.margin, 58, { charSpace: 2 });

  hr(doc, 62, T.darkGray, T.margin, T.col);

  // Report title
  font(doc, 'bold', 26);
  rgb(doc, T.white);
  const titleLines = doc.splitTextToSize(digestName.toUpperCase(), T.col);
  titleLines.slice(0, 3).forEach((l, i) => {
    doc.text(l, T.margin, 78 + i * 14);
  });

  // Trend Report subtitle
  font(doc, 'normal', 13);
  rgb(doc, T.amber);
  doc.text('Trend & Intelligence Report', T.margin, 78 + Math.min(titleLines.length, 3) * 14 + 4);

  // Date range
  const dateStr = `${format(new Date(startDate), 'MMMM d, yyyy')} – ${format(new Date(endDate), 'MMMM d, yyyy')}`;
  font(doc, 'normal', 9);
  rgb(doc, T.midGray);
  doc.text(dateStr, T.margin, 148);

  // Stats row
  font(doc, 'bold', 18);
  rgb(doc, T.amberLight);
  doc.text(String(deliveryCount), T.margin, 165);
  font(doc, 'normal', 8);
  rgb(doc, T.midGray);
  doc.text('DIGEST ISSUES ANALYZED', T.margin + 16, 165);

  // Lower section (white) — report metadata
  font(doc, 'normal', 8);
  rgb(doc, T.darkGray);
  doc.text('PREPARED BY', T.margin, 195);
  font(doc, 'bold', 10);
  rgb(doc, T.charcoal);
  doc.text('MergeRSS Intelligence Engine', T.margin, 202);

  font(doc, 'normal', 8);
  rgb(doc, T.darkGray);
  doc.text('GENERATED ON', T.margin + 80, 195);
  font(doc, 'bold', 10);
  rgb(doc, T.charcoal);
  doc.text(format(new Date(), 'MMMM d, yyyy'), T.margin + 80, 202);

  hr(doc, 215, T.lightGray);

  font(doc, 'italic', 8);
  rgb(doc, T.midGray);
  doc.text(
    'This report was generated by an AI-powered analysis engine from curated digest data.\nContent is for informational purposes and reflects data available within the specified date range.',
    T.margin, 223, { maxWidth: T.col }
  );

  // Footer bar
  rect(doc, 0, T.pageH - 10, T.pageW, 10, T.black);
  font(doc, 'normal', 7);
  rgb(doc, T.midGray);
  doc.text('CONFIDENTIAL  ·  MERGRESS INTELLIGENCE', T.margin, T.pageH - 4);
  doc.text('mergerss.com', T.pageW - T.margin, T.pageH - 4, { align: 'right' });
}

// Page footer
function addFooter(doc, pageNum) {
  rect(doc, 0, T.pageH - 10, T.pageW, 10, T.slateLight);
  hr(doc, T.pageH - 10, T.lightGray);
  font(doc, 'normal', 7);
  rgb(doc, T.midGray);
  doc.text('MergeRSS Intelligence Report  ·  Confidential', T.margin, T.pageH - 4);
  doc.text(String(pageNum), T.pageW - T.margin, T.pageH - 4, { align: 'right' });
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

  // ── PAGE 2+ CONTENT ──────────────────────────────────────────────────────
  doc.addPage();
  let page = 2;
  let y = 22;
  addFooter(doc, page);

  // Helper: new page with footer
  const newPage = () => {
    doc.addPage();
    page++;
    addFooter(doc, page);
    y = 22;
  };

  const needsPage = (space) => {
    if (y + space > T.pageH - 16) newPage();
  };

  // ── 01 EXECUTIVE SUMMARY ────────────────────────────────────────────────
  y = sectionLabel(doc, y, '01', 'Executive Summary');

  if (r.executive_summary) {
    // Key takeaway box
    y = takeawayBox(doc, y + 2, r.executive_summary);
    y += 4;

    // Executive summary body — split into paragraphs
    const paragraphs = r.executive_summary
      .split(/\n+/)
      .filter(p => p.trim().length > 0)
      .slice(0, 5);

    paragraphs.forEach(para => {
      needsPage(20);
      y = text(doc, para, T.margin, y, {
        size: 9.5,
        color: T.charcoal,
        maxW: T.col,
        lineH: 4.6,
      });
      y += 4;
    });
  }

  y += 6;
  hr(doc, y, T.lightGray);
  y += 10;

  // ── 02 KEY THEMES ───────────────────────────────────────────────────────
  if (r.key_themes?.length > 0) {
    needsPage(30);
    y = sectionLabel(doc, y, '02', 'Key Themes & Evolution');

    r.key_themes.forEach((theme, i) => {
      needsPage(44);

      // Theme card background
      rect(doc, T.margin, y, T.col, 2, T.amber);  // top accent stripe

      const cardStartY = y + 2;
      // We'll calc height after rendering, use light fill
      rect(doc, T.margin, cardStartY, T.col, 38, T.slateLight);

      // Theme number + title
      font(doc, 'bold', 7);
      rgb(doc, T.amber);
      doc.text(`THEME ${String(i + 1).padStart(2, '0')}`, T.margin + 4, cardStartY + 6);

      font(doc, 'bold', 12);
      rgb(doc, T.charcoal);
      const titleLines = doc.splitTextToSize(theme.theme, T.col - 50);
      titleLines.slice(0, 2).forEach((l, li) => doc.text(l, T.margin + 4, cardStartY + 13 + li * 6));

      // Trajectory pill
      const cfg = TRAJ[theme.trajectory] || TRAJ.stable;
      const pillLabel = cfg.label;
      font(doc, 'bold', 7);
      const pillW = doc.getTextWidth(pillLabel) + 8;
      const pillX = T.margin + T.col - pillW - 4;
      rect(doc, pillX, cardStartY + 4, pillW, 7, cfg.bg);
      rgb(doc, cfg.fg);
      doc.text(pillLabel, pillX + 4, cardStartY + 9);

      // Description
      font(doc, 'normal', 8.5);
      rgb(doc, T.darkGray);
      const descLines = doc.splitTextToSize(theme.description || '', T.col - 8);
      let descY = cardStartY + (titleLines.length > 1 ? 26 : 22);
      descLines.slice(0, 5).forEach(l => {
        if (descY < cardStartY + 35) doc.text(l, T.margin + 4, descY);
        descY += 4.2;
      });

      y = cardStartY + 42;
      y += 4;
    });

    y += 2;
    hr(doc, y, T.lightGray);
    y += 10;
  }

  // ── 03 TREND TRAJECTORIES ───────────────────────────────────────────────
  const hasTraj = r.escalating_topics?.length || r.deescalating_topics?.length || r.cyclical_topics?.length;
  if (hasTraj) {
    needsPage(50);
    y = sectionLabel(doc, y, '03', 'Trend Trajectories');

    const colW = (T.col - 6) / 3;

    const drawTrajCol = (x, topics, label, fg, bg) => {
      rect(doc, x, y, colW, 8, fg);
      font(doc, 'bold', 7);
      rgb(doc, T.white);
      doc.text(label.toUpperCase(), x + 3, y + 5.5);
      rect(doc, x, y + 8, colW, Math.max(topics.length * 6 + 8, 20), bg);
      font(doc, 'normal', 8);
      rgb(doc, T.charcoal);
      topics.slice(0, 6).forEach((t, i) => {
        doc.text(`• ${t}`, x + 3, y + 17 + i * 6, { maxWidth: colW - 6 });
      });
    };

    const maxItems = Math.max(
      r.escalating_topics?.length || 0,
      r.deescalating_topics?.length || 0,
      r.cyclical_topics?.length || 0
    );
    const boxH = Math.max(maxItems * 6 + 8, 20);

    if (r.escalating_topics?.length)
      drawTrajCol(T.margin, r.escalating_topics, 'Escalating ↑', T.emerald, T.emeraldFaint);
    if (r.deescalating_topics?.length)
      drawTrajCol(T.margin + colW + 3, r.deescalating_topics, 'De-escalating ↓', T.blue, T.blueFaint);
    if (r.cyclical_topics?.length)
      drawTrajCol(T.margin + (colW + 3) * 2, r.cyclical_topics, 'Cyclical ⚡', [161, 98, 7], [255, 247, 229]);

    y += boxH + 18;
    hr(doc, y, T.lightGray);
    y += 10;
  }

  // ── 04 INFLECTION POINTS ────────────────────────────────────────────────
  if (r.inflection_points?.length > 0) {
    needsPage(40);
    y = sectionLabel(doc, y, '04', 'Significant Inflection Points');

    r.inflection_points.forEach((pt, i) => {
      needsPage(30);

      // Timeline left bar
      if (i < r.inflection_points.length - 1) {
        stroke(doc, T.lightGray);
        doc.setLineWidth(0.5);
        doc.line(T.margin + 5, y + 6, T.margin + 5, y + 32);
      }

      // Dot
      fill(doc, T.amber);
      doc.circle(T.margin + 5, y + 4, 2, 'F');

      // Date
      font(doc, 'bold', 8);
      rgb(doc, T.amber);
      doc.text(pt.date || '', T.margin + 12, y + 5);

      // Event headline
      font(doc, 'bold', 10);
      rgb(doc, T.charcoal);
      const evLines = doc.splitTextToSize(pt.event || '', T.col - 16);
      evLines.slice(0, 2).forEach((l, li) => doc.text(l, T.margin + 12, y + 11 + li * 5));

      // Significance
      font(doc, 'normal', 8.5);
      rgb(doc, T.darkGray);
      const sigLines = doc.splitTextToSize(pt.significance || '', T.col - 16);
      const sigY = y + 11 + Math.min(evLines.length, 2) * 5 + 2;
      sigLines.slice(0, 3).forEach((l, li) => doc.text(l, T.margin + 12, sigY + li * 4.2));

      y += 34;
    });

    y += 4;
    hr(doc, y, T.lightGray);
    y += 10;
  }

  // ── 05 OUTLOOK ──────────────────────────────────────────────────────────
  if (r.outlook) {
    needsPage(50);
    y = sectionLabel(doc, y, '05', 'Outlook & Forward Signals');

    // "What to watch" — parse outlook into bullet-sized chunks
    const sentences = r.outlook
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 8);

    sentences.slice(0, 8).forEach((sentence, i) => {
      needsPage(18);
      // Numbered signal box
      rect(doc, T.margin, y, 8, 8, T.charcoal);
      font(doc, 'bold', 7);
      rgb(doc, T.amberLight);
      doc.text(String(i + 1), T.margin + 2.5, y + 5.5);

      font(doc, 'normal', 9);
      rgb(doc, T.charcoal);
      const sl = doc.splitTextToSize(sentence.trim(), T.col - 14);
      sl.slice(0, 2).forEach((l, li) => doc.text(l, T.margin + 12, y + 4 + li * 4.5));
      y += Math.max(sl.length * 4.5 + 4, 12) + 3;
    });

    y += 4;
    hr(doc, y, T.lightGray);
    y += 10;
  }

  // ── 06 APPENDIX / DATA SUMMARY ──────────────────────────────────────────
  if (r.data_summary) {
    needsPage(40);
    y = sectionLabel(doc, y, '06', 'Data Summary');

    rect(doc, T.margin, y, T.col, 28, T.slateLight);

    const items = [
      ['Digests Analyzed', String(r.data_summary.digest_count || deliveryCount)],
      ['Date Range', r.data_summary.date_range || `${startDate} – ${endDate}`],
      ['Most Active Period', r.data_summary.most_active_period || '—'],
    ];

    items.forEach(([label, val], i) => {
      font(doc, 'bold', 7);
      rgb(doc, T.darkGray);
      doc.text(label.toUpperCase(), T.margin + 4 + i * 60, y + 7);
      font(doc, 'bold', 11);
      rgb(doc, T.charcoal);
      doc.text(val, T.margin + 4 + i * 60, y + 15, { maxWidth: 56 });
    });

    y += 32;
  }

  // ── FINAL BACK PAGE ──────────────────────────────────────────────────────
  newPage();
  rect(doc, 0, 0, T.pageW, T.pageH, T.black);
  addFooter(doc, page);

  // Centered branding
  rect(doc, T.pageW / 2 - 10, T.pageH / 2 - 30, 20, 20, T.amber);
  font(doc, 'bold', 14);
  rgb(doc, T.black);
  doc.text('M', T.pageW / 2 - 3.5, T.pageH / 2 - 16);

  font(doc, 'bold', 16);
  rgb(doc, T.white);
  doc.text('MergeRSS', T.pageW / 2, T.pageH / 2 - 2, { align: 'center' });

  font(doc, 'normal', 9);
  rgb(doc, T.midGray);
  doc.text('Intelligence. Curated.', T.pageW / 2, T.pageH / 2 + 7, { align: 'center' });

  hr(doc, T.pageH / 2 + 14, T.darkGray, T.pageW / 2 - 30, 60);

  font(doc, 'normal', 8);
  rgb(doc, T.midGray);
  doc.text('mergerss.com', T.pageW / 2, T.pageH / 2 + 22, { align: 'center' });

  // ── SAVE ────────────────────────────────────────────────────────────────
  const filename = `${digestName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-report-${startDate}.pdf`;
  doc.save(filename);
}
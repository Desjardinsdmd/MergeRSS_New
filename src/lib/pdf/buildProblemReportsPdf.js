/**
 * Problem Reports export (admin). Same v3 "briefing studio" PDF language as
 * the briefing report: ink pages, violet logo lockup, mono labels, one
 * rounded panel per report. Source of truth for colour and type: BRAND.md.
 */

import { jsPDF } from 'jspdf';
import { C, G, FONT, PT, TONES } from './tokens.js';
import { setFont, color, rect, hline, panel, mono, chip, chipSize, logoMark } from './draw.js';
import { sanitizeText } from './markdown.js';

const PRIORITY_TONE = { critical: TONES.red, high: TONES.red, medium: TONES.amber, low: TONES.neutral };
const STATUS_TONE = { open: TONES.violet, in_progress: TONES.sky, resolved: TONES.emerald, closed: TONES.neutral };

const PAD = 6;          // panel inner padding
const LINE = 4.6;       // body line height (mm) at 9.5pt
const SMALL_LINE = 3.9; // mono line height at 7.4pt

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function buildProblemReportsPdf(reports = [], { statusLabel = 'all' } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const x = G.mX;
  const w = G.col;
  const inner = w - PAD * 2;
  let page = 1;
  let y = 0;

  const background = () => rect(doc, 0, 0, G.pageW, G.pageH, C.ink);

  const header = () => {
    background();
    logoMark(doc, x, 11, 6);
    setFont(doc, FONT.display, 'bold', 10.5);
    color(doc, C.strong);
    doc.text('MergeRSS', x + 8.5, 15.2);
    mono(doc, 'Problem reports', G.pageW - x, 15.2, { size: 6.6, rgb: C.meta, align: 'right' });
    hline(doc, x, G.pageW - x, 20.5, C.hairline);
    y = G.contentTop;
  };

  const footer = () => {
    hline(doc, x, G.pageW - x, G.footerLine, C.hairline);
    mono(doc, `Generated ${fmtDate(new Date().toISOString())}`, x, G.footerLine + 5, { size: 6.2, rgb: C.faint, upper: false, style: 'normal' });
    mono(doc, `Page ${page}`, G.pageW - x, G.footerLine + 5, { size: 6.2, rgb: C.faint, align: 'right' });
  };

  const newPage = () => {
    footer();
    doc.addPage('letter', 'portrait');
    page += 1;
    header();
  };

  const wrap = (text, size, style = 'normal', family = FONT.body) => {
    setFont(doc, family, style, size);
    return doc.splitTextToSize(sanitizeText(String(text || '')), inner);
  };

  // ── Page 1 title block ────────────────────────────────────────────────
  header();
  mono(doc, `Status: ${statusLabel.replace('_', ' ')}`, x, y + 2, { size: 6.8, rgb: C.violetLight });
  setFont(doc, FONT.display, 'bold', 22);
  color(doc, C.strong);
  doc.text('Problem reports', x, y + 12);
  setFont(doc, FONT.body, 'normal', 10);
  color(doc, C.muted);
  doc.text(`${reports.length} report${reports.length === 1 ? '' : 's'} from users, newest first.`, x, y + 19);
  y += 28;

  if (!reports.length) {
    panel(doc, x, y, w, 18);
    setFont(doc, FONT.body, 'normal', 10);
    color(doc, C.muted);
    doc.text('No reports in this view.', x + PAD, y + 10.5);
  }

  reports.forEach((r, idx) => {
    const title = wrap(r.title || 'Untitled report', 11.5, 'bold', FONT.display);
    const desc = r.description ? wrap(r.description, 9.5) : [];
    const notes = r.admin_notes ? wrap(r.admin_notes, 9.5) : [];
    const browser = r.browser_info ? wrap(r.browser_info, 7.4, 'normal', FONT.mono).slice(0, 6) : [];

    const metaLine = [r.user_email || 'Unknown user', r.page ? `on ${r.page}` : '', fmtDate(r.created_date)].filter(Boolean).join('  ·  ');

    // Height estimate so a report never splits across pages when it fits on one.
    const h = PAD
      + 5            // chips row
      + 3 + title.length * 5.2
      + 4.5          // meta line
      + (desc.length ? 6 + desc.length * LINE : 0)
      + (notes.length ? 8 + notes.length * LINE : 0)
      + (browser.length ? 8 + browser.length * SMALL_LINE : 0)
      + PAD;

    if (y + h > G.bottom && y > G.contentTop + 1) newPage();

    const top = y;
    panel(doc, x, top, w, Math.min(h, G.bottom - top));
    let cy = top + PAD;

    // Chips: number, priority, status
    let cx = x + PAD;
    mono(doc, String(idx + 1).padStart(2, '0'), cx, cy + 3.6, { size: 9, rgb: idx === 0 ? C.violet : C.faint, charSpace: 0.2 });
    cx += 9;
    const pr = String(r.priority || 'medium').toLowerCase();
    cx += chip(doc, pr, cx, cy, PRIORITY_TONE[pr] || TONES.neutral).w + 2;
    const st = String(r.status || 'open').toLowerCase();
    chip(doc, st.replace('_', ' '), cx, cy, STATUS_TONE[st] || TONES.neutral);
    cy += 5 + 3;

    // Title
    setFont(doc, FONT.display, 'bold', 11.5);
    color(doc, C.strong);
    title.forEach((line) => { cy += 4.2; doc.text(line, x + PAD, cy); cy += 1; });

    // Meta
    cy += 4.5;
    mono(doc, metaLine, x + PAD, cy, { size: 6.6, rgb: C.meta, upper: false, style: 'normal', charSpace: 0.15 });

    const section = (label, lines, size, lh, family, rgb) => {
      if (!lines.length) return;
      cy += label ? 6 : 4;
      if (label) { mono(doc, label, x + PAD, cy, { size: 6.4, rgb: C.meta }); cy += 2; }
      setFont(doc, family, 'normal', size);
      color(doc, rgb);
      lines.forEach((line) => {
        if (cy + lh > G.bottom) { newPage(); cy = y; }
        cy += lh;
        doc.text(line, x + PAD, cy);
      });
    };

    section('', desc, 9.5, LINE, FONT.body, C.body);
    section('Admin notes', notes, 9.5, LINE, FONT.body, C.violetLight);
    section('Browser', browser, 7.4, SMALL_LINE, FONT.mono, C.muted);

    y = Math.max(cy + PAD, top + h) + 4;
  });

  footer();
  return doc;
}

export function downloadProblemReportsPdf(reports, statusFilter) {
  const doc = buildProblemReportsPdf(reports, { statusLabel: statusFilter || 'all' });
  doc.save(`mergerss-problem-reports-${statusFilter || 'all'}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Keep chipSize referenced for tree-shaking parity with buildReportPdf consumers.
export const _chipSize = chipSize;
export const _PT = PT;

/**
 * Drawing primitives for the MergeRSS PDF: fonts, panels, chips, the logo
 * mark and a rich-text line layout engine that wraps mixed-style runs
 * (bold, italic, code, links) and breaks words longer than the line.
 */

import { C, FONT, PT, RADIUS } from './tokens.js';
import { helveticaWidthPt } from './metrics.js';

export function setFont(doc, family, style, size) {
  doc.setFont(family, style);
  doc.setFontSize(size);
}

export const fill = (doc, rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
export const stroke = (doc, rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
export const color = (doc, rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

export function rect(doc, x, y, w, h, bg) {
  fill(doc, bg);
  doc.rect(x, y, w, h, 'F');
}

export function hline(doc, x1, x2, y, rgb = C.hairline, lw = 0.25) {
  stroke(doc, rgb);
  doc.setLineWidth(lw);
  doc.line(x1, y, x2, y);
}

export function vline(doc, x, y1, y2, rgb = C.hairline, lw = 0.25) {
  stroke(doc, rgb);
  doc.setLineWidth(lw);
  doc.line(x, y1, x, y2);
}

/** Rounded panel with optional hairline border. */
export function panel(doc, x, y, w, h, { bg = C.panel, border = C.hairline, radius = RADIUS.panel, lw = 0.25 } = {}) {
  const r = Math.min(radius, h / 2, w / 2);
  fill(doc, bg);
  if (border) {
    stroke(doc, border);
    doc.setLineWidth(lw);
    doc.roundedRect(x, y, w, h, r, r, 'FD');
  } else {
    doc.roundedRect(x, y, w, h, r, r, 'F');
  }
}

export function dot(doc, x, y, r, rgb) {
  fill(doc, rgb);
  doc.circle(x, y, r, 'F');
}

/** Set fill opacity when the GState extension is available. Returns success. */
export function setOpacity(doc, opacity) {
  try {
    if (typeof doc.GState !== 'function' || typeof doc.setGState !== 'function') return false;
    doc.setGState(new doc.GState({ opacity, 'stroke-opacity': opacity }));
    return true;
  } catch {
    return false;
  }
}

/** Soft violet glow: stacked low-opacity circles. Skipped when GState is missing. */
export function glow(doc, cx, cy, maxR, layers = 9, opacity = 0.035) {
  if (!setOpacity(doc, opacity)) return;
  for (let i = 0; i < layers; i++) {
    const r = maxR * (1 - i / layers);
    dot(doc, cx, cy, r, i < layers / 2 ? C.violetDeep : C.violet);
  }
  setOpacity(doc, 1);
}

// ─── Mono labels (uppercase, letter-spaced) ─────────────────────────────────

export function monoWidth(doc, text, size, charSpace = 0, style = 'normal') {
  setFont(doc, FONT.mono, style, size);
  const s = String(text);
  return doc.getTextWidth(s) + charSpace * Math.max(0, s.length - 1);
}

/**
 * Mono label. align: 'left' | 'right' | 'center'. Draws uppercase by default.
 * Returns drawn width.
 */
export function mono(doc, text, x, y, { size = 6.8, rgb = C.meta, charSpace = 0.28, style = 'bold', align = 'left', upper = true } = {}) {
  const s = upper ? String(text).toUpperCase() : String(text);
  const w = monoWidth(doc, s, size, charSpace, style);
  let tx = x;
  if (align === 'right') tx = x - w;
  else if (align === 'center') tx = x - w / 2;
  color(doc, rgb);
  doc.text(s, tx, y, { charSpace });
  return w;
}

/** Truncate a string with "..." so the mono label fits maxW. */
export function fitMono(doc, text, maxW, size, charSpace, style = 'normal') {
  let s = String(text);
  if (monoWidth(doc, s, size, charSpace, style) <= maxW) return s;
  while (s.length > 1 && monoWidth(doc, `${s}...`, size, charSpace, style) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

/** Wrap mono text by words (mono glyphs are fixed width). */
export function wrapMono(doc, text, maxW, size, charSpace, style = 'normal') {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || monoWidth(doc, next, size, charSpace, style) <= maxW) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Chip / badge: mono uppercase text on a tinted rounded fill. Returns { w, h }. */
export function chipSize(doc, text, { size = 6.2, charSpace = 0.23, padX = 2.2, h = 5 } = {}) {
  return { w: monoWidth(doc, String(text).toUpperCase(), size, charSpace, 'bold') + padX * 2, h };
}

export function chip(doc, text, x, y, toneDef, { size = 6.2, charSpace = 0.23, padX = 2.2, h = 5 } = {}) {
  const { w } = chipSize(doc, text, { size, charSpace, padX, h });
  panel(doc, x, y, w, h, { bg: toneDef.bg, border: toneDef.border, radius: RADIUS.chip, lw: 0.2 });
  mono(doc, text, x + padX, y + h / 2 + size * PT * 0.36, { size, rgb: toneDef.fg, charSpace, style: 'bold' });
  return { w, h };
}

// ─── Logo mark ──────────────────────────────────────────────────────────────

/**
 * Rounded violet square with the RSS glyph (Lucide geometry on a 24 grid:
 * arcs centred at (4,20) with radii 9 and 16, dot at (5,19)).
 */
export function logoMark(doc, x, y, s) {
  const r = s * 0.28;
  fill(doc, C.violet);
  doc.roundedRect(x, y, s, s, r, r, 'F');
  // Lighter wash in the top-left half to suggest the brand gradient.
  if (setOpacity(doc, 0.35)) {
    fill(doc, [181, 123, 255]);
    doc.roundedRect(x, y, s * 0.62, s * 0.62, r * 0.9, r * 0.9, 'F');
    setOpacity(doc, 0.5);
    fill(doc, C.violet);
    doc.roundedRect(x, y, s, s, r, r, 'F');
    setOpacity(doc, 1);
  }

  const g = s * 0.6;
  const ox = x + (s - g) / 2;
  const oy = y + (s - g) / 2;
  const u = g / 24;
  const P = (gx, gy) => [ox + gx * u, oy + gy * u];
  const k = 0.5523;

  stroke(doc, C.white);
  doc.setLineWidth(2.1 * u);
  doc.setLineCap('round');
  for (const rad of [9, 16]) {
    const [sx, sy] = P(4, 20 - rad);
    const rr = rad * u;
    doc.lines([[k * rr, 0, rr, rr - k * rr, rr, rr]], sx, sy, [1, 1], 'S', false);
  }
  doc.setLineCap('butt');
  const [dx, dy] = P(5, 19);
  dot(doc, dx, dy, 1.25 * u, C.white);
}

// ─── Rich text ──────────────────────────────────────────────────────────────

/**
 * base: { size, rgb, font?, bold?, italic?, strong?: rgb for bold runs, lh }
 */
function runFont(run, base) {
  if (run.code) return [FONT.mono, 'normal'];
  const b = !!(run.bold || base.bold);
  const it = !!(run.italic || base.italic);
  return [base.font || FONT.body, b && it ? 'bolditalic' : b ? 'bold' : it ? 'italic' : 'normal'];
}

function runSize(run, base) {
  return run.code ? base.size * 0.92 : base.size;
}

/**
 * Text width in mm using unkerned AFM metrics (what the PDF actually draws).
 * jsPDF's getTextWidth kerns, which made words collide after a style change.
 */
function measure(doc, text, run, base) {
  const [f, st] = runFont(run, base);
  const size = runSize(run, base);
  if (f === FONT.mono) return text.length * 0.6 * size * PT;
  if (f === 'helvetica') return helveticaWidthPt(text, size, st === 'bold' || st === 'bolditalic') * PT;
  setFont(doc, f, st, size);
  return doc.getTextWidth(text);
}

/** Break a single over-long word into chunks no wider than maxW. */
function breakWord(doc, word, run, base, maxW) {
  const out = [];
  let cur = '';
  for (const ch of word) {
    if (cur && measure(doc, cur + ch, run, base) > maxW) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Lay runs into lines no wider than maxW.
 * Returns [{ frags: [{ text, run, x, w }] }].
 */
export function layoutRuns(doc, runs, maxW, base) {
  const lines = [];
  let line = { frags: [] };
  let x = 0;
  let pendingSpace = null;
  let gluePrev = false; // previous token was a word with no whitespace after it

  const newLine = () => { lines.push(line); line = { frags: [] }; x = 0; pendingSpace = null; gluePrev = false; };
  const append = (text, run) => {
    const w = measure(doc, text, run, base);
    const last = line.frags[line.frags.length - 1];
    if (last && last.run === run) { last.text += text; last.w += w; }
    else line.frags.push({ text, run, x, w });
    x += w;
  };

  for (const run of runs) {
    const tokens = run.text.split(/(\s+)/).filter(t => t !== '');
    for (const tok of tokens) {
      if (/^\s+$/.test(tok)) {
        if (/\n/.test(tok) && run.hardBreak) { newLine(); continue; }
        if (line.frags.length) pendingSpace = run;
        gluePrev = false;
        continue;
      }
      const w = measure(doc, tok, run, base);
      const spaceW = pendingSpace ? measure(doc, ' ', pendingSpace, base) : 0;

      if (w > maxW) {
        if (line.frags.length) newLine();
        const parts = breakWord(doc, tok, run, base, maxW);
        parts.forEach((p, i) => { append(p, run); if (i < parts.length - 1) newLine(); });
        gluePrev = true;
        continue;
      }

      if (line.frags.length && x + spaceW + w > maxW) {
        // Punctuation glued to the previous word (e.g. a link followed by ",")
        // moves together with that word when it fits on its own line.
        if (gluePrev && !pendingSpace && line.frags.length > 0) {
          const last = line.frags[line.frags.length - 1];
          const m = last.text.match(/(\S+)$/);
          const lastWord = m ? m[1] : '';
          const lastWordW = lastWord ? measure(doc, lastWord, last.run, base) : 0;
          if (lastWord && lastWordW + w <= maxW && lastWord.length < last.text.length + 1) {
            last.text = last.text.slice(0, last.text.length - lastWord.length).replace(/\s+$/, '');
            last.w = measure(doc, last.text, last.run, base);
            if (!last.text) line.frags.pop();
            const carryRun = last.run;
            newLine();
            append(lastWord, carryRun);
            append(tok, run);
            gluePrev = true;
            continue;
          }
        }
        newLine();
      } else if (pendingSpace && line.frags.length) {
        append(' ', pendingSpace);
      }
      pendingSpace = null;
      append(tok, run);
      gluePrev = true;
    }
  }
  if (line.frags.length) lines.push(line);
  return lines;
}

/**
 * Draw one laid-out line at baseline y. Links get light-violet text, a thin
 * underline and a clickable annotation.
 */
export function drawLine(doc, line, x, y, base) {
  for (const f of line.frags) {
    const run = f.run;
    const [fam, st] = runFont(run, base);
    const size = runSize(run, base);
    setFont(doc, fam, st, size);
    let rgb = base.rgb;
    if (run.href || run.lead) rgb = C.violetLight;
    else if (run.bold && base.strong) rgb = base.strong;
    else if (run.code) rgb = C.body;
    color(doc, rgb);
    const text = f.text;
    if (!text.trim()) {
      // Keep real spaces in the text layer so copy and extraction read naturally.
      doc.text(text, x + f.x, y);
      continue;
    }
    doc.text(text, x + f.x, y);
    const lead = text.length - text.trimStart().length;
    const tx = x + f.x + (lead ? measure(doc, text.slice(0, lead), run, base) : 0);
    const shown = text.trim();
    if (run.href) {
      const w = measure(doc, shown, run, base);
      stroke(doc, [126, 92, 190]);
      doc.setLineWidth(0.18);
      doc.line(tx, y + 0.7, tx + w, y + 0.7);
      try {
        doc.link(tx, y - size * PT * 0.85, w, size * PT * 1.15, { url: run.href });
      } catch {
        /* annotations are optional */
      }
    }
  }
}

/**
 * MergeRSS PDF design tokens (design system v3, "briefing studio").
 * Source of truth: BRAND.md. Colours are solid RGB triples because PDF
 * viewers handle alpha inconsistently; tints are pre-blended over the
 * surface they sit on.
 */

export const hex = (h) => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

/** Blend colour `a` over `b` at opacity `t` (0..1). */
export const mix = (a, b, t) => a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));

export const C = {
  ink: hex('#0A0910'),        // page
  panel: hex('#17151F'),      // cards, sections
  raised: hex('#25222F'),     // raised fills
  hairline: hex('#2A2636'),   // panel borders
  line: hex('#363244'),       // dividers
  strong: hex('#F3F1F7'),     // titles
  body: hex('#C9C5D4'),       // reading copy
  muted: hex('#A29DB1'),      // supporting copy
  meta: hex('#7C778B'),       // labels, metadata
  faint: hex('#5C576B'),      // row numbers
  white: [255, 255, 255],
  violet: hex('#9B5CF6'),
  violetDeep: hex('#7C3AED'),
  violetLight: hex('#C4A5FD'),
  emerald: hex('#34D399'),
  red: hex('#F87171'),
  sky: hex('#38BDF8'),
  amber: hex('#FBBF24'),
};

/** Semantic tone: text colour, 10% fill and 25% border over a panel. */
export function tone(color, surface = C.panel) {
  return { fg: color, bg: mix(color, surface, 0.12), border: mix(color, surface, 0.3) };
}

export const TONES = {
  emerald: tone(C.emerald),
  red: tone(C.red),
  sky: tone(C.sky),
  amber: tone(C.amber),
  violet: { fg: C.violetLight, bg: mix(C.violet, C.panel, 0.16), border: mix(C.violet, C.panel, 0.35) },
  neutral: { fg: C.muted, bg: C.raised, border: C.line },
};

/** Theme trajectory badges. Labels are ASCII only. */
export const TRAJECTORY = {
  rising: { label: 'Rising', tone: TONES.emerald },
  falling: { label: 'Falling', tone: TONES.red },
  stable: { label: 'Stable', tone: TONES.neutral },
  volatile: { label: 'Volatile', tone: TONES.amber },
  peaked: { label: 'Peaked', tone: TONES.sky },
  resolving: { label: 'Resolving', tone: TONES.sky },
};

/** US Letter portrait, millimetres. */
export const G = {
  pageW: 215.9,
  pageH: 279.4,
  mX: 18,
  contentTop: 27,        // interior pages, below the header strip
  footerLine: 264.4,     // hairline above the footer
  get col() { return this.pageW - this.mX * 2; },
  get bottom() { return this.footerLine - 6; },
  get bodyH() { return this.bottom - this.contentTop; },
};

export const RADIUS = { panel: 3, band: 2.6, chip: 1.4 };

/** pt to mm. */
export const PT = 0.3528;

export const FONT = {
  display: 'helvetica',
  body: 'helvetica',
  mono: 'courier',
};

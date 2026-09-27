# MergeRSS Brand Guidelines

Version 2.0, September 26, 2026. Built from a full audit of the MergeRSS source: 189 files, every Tailwind colour class, hex literal and token reference counted. Where this spec and the code disagree, the code usage below is the ground truth and the spec wins going forward. The reference implementation is `src/components/reports/ReportViewer.jsx`.

## How the palette is built

MergeRSS runs on two systems. Neutrals come from the Tailwind stone scale, used directly in components (2,512 class uses). The accent comes from one token, `--primary`, referenced about 470 times as `hsl(var(--primary))`. Everything else is semantic colour with a fixed meaning.

## Accent

| Role | Value | Notes |
|---|---|---|
| Primary | #9463E3 | Violet Pulse, `263 70% 64%`, the default `--primary` |
| Primary, light mode | #733BCE | `263 60% 52%` |
| Text on primary | stone-900 #1C1917 | Always dark text on violet, never white |

Primary appears as solid fills (buttons, the 01 section band, the logo square), text (micro labels, links, dates in timelines), and rules (4px left border on key takeaways). Tints in use: /5, /10 and /20 for fills, /30 to /50 for borders, /70 and /80 for softened labels.

## Neutrals

| Stone shade | Hex | Use in the code |
|---|---|---|
| App shell | #0D0A06 | `bg-[#0d0a06]`, signed-in page background |
| Public shell | #0A0805 | `bg-[#0a0805]`, landing, pricing, legal pages |
| stone-950 | #0C0A09 | Report section bodies, deepest panels |
| stone-900 | #1C1917 | Cards, section bands, callout fills (129 uses) |
| stone-800 | #292524 | Inputs, raised fills and the main border (266 bg, 196 border) |
| stone-700 | #44403C | Secondary border, band dividers (177 border) |
| stone-600 | #57534E | Faint text, row numbers (260 text) |
| stone-500 | #78716C | Metadata, dates, subtitles (384 text, the most used) |
| stone-400 | #A8A29E | Secondary copy, band labels (247 text) |
| stone-300 | #D6D3D1 | Body copy on dark (162 text) |
| stone-200 | #E7E5E4 | Emphasised body, takeaway text (151 text) |
| stone-100 | #F5F5F4 | Headlines and titles (191 text) |

Text hierarchy runs stone-100 for titles, stone-300 for reading copy, stone-400 for supporting copy, stone-500 for metadata and stone-600 for anything that should recede.

## Semantic colour

Each colour means one thing. They always render as the -400 shade on a 10% fill of the same hue, with no border.

| Meaning | Colour | Where it appears |
|---|---|---|
| Rising, escalating, opportunity | emerald-400 #34D399 | Trajectory badges, trend columns, Opportunity tag |
| Falling, risk, errors | red-400 #F87171 | Falling badge, Risk tag, destructive states |
| De-escalating, resolving, trending | blue-400 #60A5FA | Trend columns, Trending tag |
| Volatile, warnings | amber-400 #FBBF24 | Volatile badge, warning banners (`amber-950/20` fill, `amber-900/40` border, `amber-300` text) |
| Peaked | orange-400 | Trajectory badge only |
| Supporting | sky-400 | Landing briefing mock |

Slack aubergine, Discord blurple and Teams indigo appear only on their own integration buttons.

## Typography

The font stack is Inter, then the system sans (Segoe UI on Windows, San Francisco on Apple). Inter is declared but never loaded as a webfont, so most people see their system face. Semibold (243 uses) and medium (191) carry the interface, bold (159) carries titles and labels, and black (30) is kept for landing headlines and big stat numbers.

| Style | Classes | Use |
|---|---|---|
| Page title | `text-2xl` to `text-4xl font-bold` | Page and report titles |
| Section title | `text-sm font-semibold text-stone-100` | Theme rows, list items |
| Body | `text-sm text-stone-300 leading-[1.8]` | Report and summary copy |
| Meta | `text-xs` or `text-sm text-stone-500` | Dates, counts, sources |
| Micro label | `text-[10px] font-bold uppercase tracking-widest` | Section names, "Key takeaway", timeline dates |
| Eyebrow | `text-[10px] font-bold tracking-[0.2em] uppercase` in primary | "Intelligence Report" over a title |

## Shape

The general interface uses a small radius. `rounded-lg` (6px) is the most common value at 156 uses, followed by plain `rounded` and `rounded-md`, on inputs, cards and dialogs. Intelligence surfaces are square: the report viewer, its section bands, trajectory badges, the Export PDF button, the landing briefing card and the logo mark all have no radius. `rounded-full` is reserved for count badges, timeline dots and spinners.

Structure comes from 1px stone-800 borders and stacked panels with `border-t-0`. Shadows are rare and only used for hover lift.

## Signature components

**Numbered section band.** A full-width strip, `px-6 py-3`, holding a two-digit number, a 1px by 12px divider and a micro label. Section 01 is solid primary with stone-900 text. Later sections are stone-900 with a stone-500 number, a stone-700 divider and a stone-400 label, sitting on a stone-800 bottom border.

**Key takeaway.** `border-l-4` in primary on a stone-900 fill, `px-5 py-4`, with a primary micro label above stone-200 or stone-100 text.

**Theme row.** A stone-600 number in a fixed 24px column, a stone-100 semibold title, a trajectory badge on the right, and stone-400 description copy indented under the title. Rows are divided by stone-800 at 60%.

**Trajectory badge.** `text-[10px] px-2 py-0.5 font-semibold` with a -400 text colour on a /10 fill. Sentence case labels such as "Rising ↑" and "Stable →".

**Timeline.** A 1px stone-800 spine, 14px primary dots with a stone-950 ring, primary date labels, stone-100 event titles and stone-400 significance copy.

**Primary button.** Primary fill, stone-900 text, `font-semibold`, square in intelligence surfaces and `rounded-lg` in general UI.

## Logo

A primary-coloured square containing the Lucide RSS icon in stone-900, followed by "MergeRSS" in bold stone-100 with tight tracking. It sits in the header at 28px. Email uses a plain primary square because mail clients strip SVG.

## Voice

Copy reads like an analyst briefing a principal: consequence first, short sentences, real numbers. Labels are plain nouns such as "Key takeaway" or "Inflection points". Hype words and exclamation marks are out.

## Email

The digest email is a direct translation of the report viewer: a report header, then numbered bands (01 Key signal in primary, 02 Read first, then one band per topic), theme-style story rows and trajectory-style tag chips. Every Tailwind alpha value is pre-blended to solid hex so Outlook renders it, and the font stack matches the app with no webfont call.

## Known drift

1. **PDF export palette.** `src/lib/generatePremiumPdf.js` uses its own light palette with a print amber (170, 110, 0) and a navy purple (55, 35, 115), neither of which matches the product. Exported reports look like a different company made them.
2. **Hardcoded amber.** About 250 `amber-*` classes across 56 files. Warning banners and Volatile badges are correct. Leftover brand accents from the amber era should move to `hsl(var(--primary))`.
3. **Accent picker.** Users can switch primary to coral, cyan, emerald, magenta or amber. That recolours the logo and buttons with it. The logo should stay violet.
4. **Two page backgrounds.** #0D0A06 inside the app and #0A0805 on public pages. The difference is invisible; picking one would simplify things.
5. **Stale accent value.** One user record holds "indigo", which the picker no longer offers.

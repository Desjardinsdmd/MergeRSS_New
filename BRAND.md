# MergeRSS Brand Guidelines

Version 3.0, October 1, 2026. Direction: "briefing studio". Replaces v2 (square stone panels, amber era). Every surface the product touches follows this file: the app, the marketing site, PDFs, email, Slack, Discord, Teams, RSS output and error pages.

Implementation: tokens in `src/globals.css`, Tailwind theme in `tailwind.config.js`, React primitives in `src/components/brand/Brand.jsx`. Backend and email copies of the palette live in `base44/functions/lib/brand.ts`.

## Look and feel

Dark, calm, studio-like. A violet-tinted near-black page with a soft violet glow in the top-left corner. Content sits on rounded glass panels with hairline white borders. One accent, violet. Type pairs a geometric display face for headings with Inter for reading and a monospace for labels and metadata.

## Colour

| Token | Hex | Use |
|---|---|---|
| Ink (page) | #0A0910 | Page background, PDF and email background |
| Panel | #17151F (stone-900) | Cards, sections; in the app rendered as white 2.5% over the page |
| Panel raised | #25222F (stone-800) | Inputs, raised fills, borders on solid surfaces |
| Hairline | white at 7% | Panel borders (`border-white/[0.07]`) |
| Line | #363244 (stone-700) | Dividers on solid surfaces |
| Text strong | #F3F1F7 (stone-100) | Titles |
| Text body | #C9C5D4 (stone-300) | Reading copy |
| Text muted | #A29DB1 (stone-400) | Supporting copy |
| Text meta | #7C778B (stone-500) | Metadata, labels |
| Text faint | #5C576B (stone-600) | Row numbers, disabled |
| Violet | #9B5CF6 | Brand, primary buttons, active states, links |
| Violet deep | #7C3AED | Gradient end, pressed |
| Violet light | #C4A5FD | Chip text, link text on dark |

The Tailwind `stone` scale is remapped to these neutrals. Use `stone-*` for neutrals; never hardcode the old warm hexes (#0d0a06, #0a0805, #1c1917, #292524).

Brand gradient (logo, primary buttons, emphasis): `linear-gradient(135deg, #B57BFF, #9B5CF6 45%, #7C3AED)`.

### Semantic colour

Each colour means one thing and renders as the -300/-400 text on a 10% fill of the same hue.

| Meaning | Colour |
|---|---|
| Rising, opportunity, success, high importance, unread count | emerald-400 #34D399 |
| Falling, risk, errors, destructive | red-400 #F87171 |
| Trending, informational | sky-400 #38BDF8 |
| Warnings only (paused, skipped, needs attention) | amber-400 #FBBF24 on amber-400/10 with amber-400/25 border |

Amber is never a brand accent. Category chips, unread dots, stars, highlights and CTAs use violet.

## Type

| Role | Face | Classes |
|---|---|---|
| Display (page titles, section titles, big numbers, wordmark) | Space Grotesk 500-700 | `font-display` |
| Body and UI | Inter 400-600 | `font-sans` (default) |
| Labels, metadata, chips, timestamps, counts | JetBrains Mono 400-600 | `font-mono` |

Page title: `font-display text-[28px] font-semibold`. Section title: `font-display text-lg font-semibold`. Body: `text-sm` to `text-[15px]` stone-300. Micro label: `.micro-label` (mono, 10px, uppercase, wide tracking, stone-500). Eyebrow: `.eyebrow` (mono, violet). Metadata line: `.meta` (mono, uppercase, stone-500, items separated by " · ").

## Shape and depth

Radius scale: chips 6px (`rounded-md`), inputs and buttons 12px (`rounded-xl`), panels 20px (`rounded-2xl`), pills full. Nothing is square. Depth comes from translucent layers and hairline borders, with a violet glow reserved for the primary button and the brand mark.

## Components

- **Panel** `.panel`: `rounded-2xl border-white/[0.07] bg-white/[0.025] backdrop-blur`. Accent panel `.panel-accent` adds a violet gradient wash for the single most important card on a page (for example "Next briefing").
- **Primary button** `.btn-brand`: violet gradient, white text, `rounded-xl`, glow shadow. One per view.
- **Soft button** `.btn-soft`: violet 14% fill, violet 30% border, light-violet text. Secondary actions such as "Run now".
- **Ghost button** `.btn-ghost`: hairline border, stone-300 text.
- **Sidebar item** `.nav-item`, active `.nav-item-active` (violet 16% fill, violet 30% border, white text).
- **Chip** `.chip-brand` (mono, violet tint) for categories and tags; `.chip-neutral` for neutral tags.
- **Signal pill** `SignalPill`: HIGH emerald outline, MED neutral outline, LOW faint.
- **Ranked story row**: large display numeral (first in violet, others stone-500), title stone-100 semibold, summary stone-400, mono meta line, bookmark icon top-right.
- **Warning card**: amber tint panel with alert icon, `rounded-xl`.
- **Tabs**: text tabs with a 2px violet underline on the active tab.

## Logo

`LogoMark`: violet gradient rounded square (12px radius at 36px) with the Lucide RSS glyph in white. Lockup: mark + "MergeRSS" in Space Grotesk semibold + "briefing studio" in mono stone-500 underneath. The logo always uses the fixed brand violet, even when a user picks another accent colour. Favicon: `public/favicon.svg`.

## Vocabulary

One name per thing, everywhere:

| Use | Not |
|---|---|
| Briefing (a scheduled summary a user configures) | Digest |
| Report (a long-form analysis over a date range, PDF export) | Digest report |
| Source | Feed (except "RSS feed" when talking about the URL format) |
| Story | Article, item, post |
| Inbox (delivered briefings + saved stories) | |
| Newsletter inbox (the user's @mergerss.com address) | Email feed |
| Today (home) | Dashboard |

Entity names in code (Digest, Feed, FeedItem) stay as they are; only user-facing copy changes.

## Voice

An analyst briefing a principal: consequence first, short sentences, real numbers. Plain nouns for labels. No hype words, no exclamation marks.

## Output surfaces

- **PDF report**: ink background pages, violet section bands, mono labels, display headings, same footer on every page. Markdown from the AI is rendered, never shown raw.
- **Email**: ink background, panel cards, violet header mark, same vocabulary. Fonts fall back to system stacks; colours are solid hex (no alpha) for Outlook.
- **Slack / Discord / Teams**: violet #9B5CF6 accent bar, "MergeRSS briefing" attribution, same section names as email.
- **RSS output**: channel title and description use the product vocabulary; generator "MergeRSS".

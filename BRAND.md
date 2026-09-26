# MergeRSS Brand Guidelines

Version 1.0, September 2026. Derived from the live MergeRSS codebase (Layout, Landing, globals.css, Tailwind config). This file lives at the app root so the Base44 builder and anyone editing the product works from one spec.

## Brand position

MergeRSS reads like an intelligence terminal for people who make capital decisions. The design borrows from trading desks and briefing rooms: a dark working surface and a single hot signal colour against dense, ranked information. Everything visual serves triage, so the reader knows in two seconds what to read first and what to skim.

## Logo

The mark is a solid amber square holding the RSS glyph in near-black. It has square corners. The wordmark "MergeRSS" sits to the right in Inter Bold, tight tracking (-0.02em), set in the foreground colour.

- Minimum mark size is 24px on screen. Below that, drop the glyph and use the plain square.
- Clear space around the lockup equals the width of the mark.
- The mark always sits on the dark field. On light backgrounds, use the near-black wordmark and keep the amber square.
- Email clients strip SVG, so email uses the plain square until a hosted PNG of the mark exists.

## Colour

Amber is the brand. It marks priority, calls to action and the logo, and nothing else. When everything is amber, nothing is urgent.

### Core palette

| Role | Hex | Token / source |
|---|---|---|
| Brand amber | #FBBF24 | amber-400 |
| Text on amber | #0F0C0B | --primary-foreground |
| Field (page background) | #0F0C0B | --background |
| Card | #171412 | --card |
| Raised surface | #25201D | --secondary |
| Border | #332C28 | --border |
| Primary text | #F3EEE8 | --foreground |
| Secondary text | #D6CEC2 | --secondary-foreground |
| Body text on cards | #C6BAA9 | .card-body |
| Muted text | #938876 | --muted-foreground |
| Metadata | #78716C | stone-500 |
| Rules and quiet accents | #57534E | stone-600 |

### Amber tints

The app builds depth from amber at low opacity over the card. Use these pre-blended values anywhere alpha is unreliable (email, PDF, exports).

| Use | Opacity | Hex on card |
|---|---|---|
| Card outline on briefing surfaces | 50% | #896A1B |
| Callout rule ("Why this matters") | 60% | #A07B1D |
| Header band divider | 25% | #503F16 |
| Signal block divider | 20% | #453616 |
| Header band fill | 7% | #272013 |
| Signal and lead story fill | 4% | #201B13 |

### Intelligence tags

Tags are outlined chips on a faint fill. They never use amber, since amber already means priority.

| Tag | Text | Border | Fill |
|---|---|---|---|
| Risk | #F87171 (red-400) | #581816 | #251110 |
| Opportunity | #34D399 (emerald-400) | #0E3A2C | #111B17 |
| Trending | #60A5FA (blue-400) | #1A2A60 | #171926 |
| Neutral | no chip | | |

## Typography

Inter is the only typeface. Fallback stack: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif. No serifs anywhere in product or email.

| Style | Size / weight | Tracking | Use |
|---|---|---|---|
| Display | 26 to 40px, 800 | -0.02em | Key signal headline, page titles |
| Headline | 17 to 21px, 700 to 800 | -0.01em | Story titles |
| Body | 14.5 to 16px, 400, line-height 1.6 | 0 | Summaries |
| Meta | 12px, 500 | 0 | Source, date, counts |
| Micro label | 10px, 800, uppercase | 0.1 to 0.2em | Section names, "Today's key signal", "Why this matters" |

Micro labels carry the system. They are always uppercase, always tracked wide, and almost always amber. Headlines stay in sentence case.

## Shape and space

Corners are square. The logo, primary buttons, chips and briefing cards have no radius, which is what separates MergeRSS from the rounded consumer look of most reader apps. Round only what is genuinely circular: count badges, spinners, avatars.

Borders do the structural work in place of shadows. Priority is shown with a left rule: 4px amber for the lead story, 2px amber at 60% for callouts, 2px stone-600 for supporting stories. Spacing runs on a 4px grid with 32px card gutters on desktop and 20px on mobile.

## Components

**Primary button.** Amber fill, near-black text, weight 800, uppercase micro-label styling at 12 to 14px, square corners. One per view.

**Briefing card.** Card fill, 2px amber outline at 50%, a header band (7% amber fill) carrying the digest name as a micro label with the date right-aligned, then a key signal block (4% amber fill) holding the display headline.

**Lead story.** 4px amber left rule on a 4% amber fill, a solid amber "Read first" chip, then headline, summary, the "Why this matters" callout and a meta line.

**Supporting story.** 2px stone-600 left rule, optional tag chip, headline, summary, meta line. Thumbnails are square, 88px, with a 1px border.

**Meta line.** Source host in stone-500, a mid-dot separator in stone-600, then "Read source" in amber bold.

## Voice

Write like an analyst briefing a principal. Lead with the consequence, keep sentences short, name numbers. Labels are plain nouns such as "Key signal" or "Bottom line". Avoid hype words such as "game-changing" or "revolutionary", and avoid exclamation marks.

## Email rules

- Dark field and dark card, matching the product. The template declares a dark colour scheme so Apple Mail and iOS Mail leave it alone.
- Solid hex only. Every alpha value in the app is replaced with its pre-blended equivalent from the tint table.
- Inter loads from Google Fonts where the client allows it and falls back to the system stack everywhere else.
- Maximum width 600px, table layout, all styles inline.

## Known drift in the codebase

These are live inconsistencies found during the review. Fixing them brings the product in line with this spec.

1. `src/main.jsx` imports `index.css` (stock shadcn neutral tokens). The warm brand tokens in `globals.css` are never loaded, so `--primary` falls back to near-black unless a user has picked an accent colour.
2. Three different ambers are in use: #FBBF24 hardcoded across 48 files, #F9A71A in the unused `globals.css` token, and #FFC857 in the "Electric Amber" accent picker. This spec standardises on #FBBF24.
3. The accent picker lets each user recolour the brand (violet, coral, cyan and others). Keep it if you want personalisation, but it should recolour interface highlights only, never the logo or emails.
4. Trending renders amber in admin panels and blue in user-facing feeds. Blue is the standard.
5. `index.html` still ships the Base44 favicon and the title "Base44 APP".
6. One user record holds the accent value "indigo", which the picker no longer offers.

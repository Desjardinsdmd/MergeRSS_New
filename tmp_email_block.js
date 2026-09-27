// ── Email design system: MergeRSS brand (see BRAND.md at the app root) ──
// Mirrors src/components/reports/ReportViewer.jsx class-for-class: stone surfaces,
// numbered section bands, primary used for section 01, labels and the lead rule.
// Tailwind alpha classes are pre-blended to solid hex so Outlook renders them.
const BRAND = {
    shell: '#0d0a06',      // app shell bg-[#0d0a06]
    s950: '#0c0a09',       // stone-950, section bodies
    s900: '#1c1917',       // stone-900, section bands and callouts
    s800: '#292524',       // stone-800, borders
    s800_60: '#1d1a19',    // divide-stone-800/60 on stone-950
    s700: '#44403c',       // stone-700, band dividers and dots
    s600: '#57534e',       // stone-600, row numbers
    s500: '#78716c',       // stone-500, meta
    s400: '#a8a29e',       // stone-400, secondary copy and band labels
    s300: '#d6d3d1',       // stone-300, body copy
    s200: '#e7e5e4',       // stone-200, takeaway copy
    s100: '#f5f5f4',       // stone-100, headlines
    s900Text: '#1c1917',   // text-stone-900 on primary
    primary: '#9463e3',    // --primary (Violet Pulse, 263 70% 64%)
};
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
// TrajectoryBadge / intelligence tags: text-{c}-400 on bg-{c}-400/10, pre-blended on stone-950
const TAG_STYLE = {
    Risk: { fg: '#f87171', bg: '#241413' },
    Opportunity: { fg: '#34d399', bg: '#101e17' },
    Trending: { fg: '#60a5fa', bg: '#141a21' },
};

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function stripTags(s) {
    return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function safeUrl(u) {
    try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.toString() : ''; }
    catch { return ''; }
}
function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function clip(s, n) {
    const t = String(s ?? '');
    return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
}
function pad2(n) { return String(n).padStart(2, '0'); }

// text-[10px] font-bold uppercase tracking-widest
function label(text, color, spacing = '0.1em') {
    return `<span style="font:700 10px/1.4 ${FONT};letter-spacing:${spacing};text-transform:uppercase;color:${color};">${esc(text)}</span>`;
}

// TrajectoryBadge: text-[10px] px-2 py-0.5 font-semibold, square, no border
function tagChip(tag) {
    const st = TAG_STYLE[tag];
    if (!st) return '';
    return `<span style="display:inline-block;background:${st.bg};color:${st.fg};font:600 10px/1 ${FONT};padding:4px 8px;white-space:nowrap;">${esc(tag)}</span>`;
}

// Numbered band. Section 01 is solid primary; the rest are stone-900.
function bandRow(num, text, isPrimary) {
    const bg = isPrimary ? BRAND.primary : BRAND.s900;
    const numColor = isPrimary ? BRAND.s900Text : BRAND.s500;
    const rule = isPrimary ? '#704da6' : BRAND.s700; // bg-stone-900/30 on primary | bg-stone-700
    const txt = isPrimary ? BRAND.s900Text : BRAND.s400;
    const bottom = isPrimary ? '' : `border-bottom:1px solid ${BRAND.s800};`;
    return `
<tr><td class="px" style="background:${bg};${bottom}padding:12px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle" style="font:700 10px/1 ${FONT};color:${numColor};">${pad2(num)}</td>
    <td valign="middle" style="padding:0 12px;"><div style="width:1px;height:12px;background:${rule};font-size:0;line-height:0;">&nbsp;</div></td>
    <td valign="middle">${label(text, txt)}</td>
  </tr></table>
</td></tr>`;
}

function sectionFrame(inner) {
    // border border-stone-800 border-t-0
    return `<tr><td style="border:1px solid ${BRAND.s800};border-top:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table></td></tr>`;
}

function metaLine(story) {
    const url = safeUrl(story.url);
    const host = hostOf(url);
    const link = url ? `<a href="${esc(url)}" style="color:${BRAND.primary};text-decoration:none;font-weight:600;">Read source</a>` : '';
    const dot = host && link ? `<span style="color:${BRAND.s700};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` : '';
    return `<p style="margin:12px 0 0;font:400 12px/1.4 ${FONT};color:${BRAND.s500};">${esc(host)}${dot}${link}</p>`;
}

// Inflection-point pattern: primary label, stone-400 copy
function takeawayBlock(story) {
    if (!story.takeaway) return '';
    return `<p style="margin:12px 0 0;">${label('Why it matters', BRAND.primary)}</p>
<p style="margin:4px 0 0;font:400 14px/1.65 ${FONT};color:${BRAND.s300};">${esc(story.takeaway)}</p>`;
}

function renderLead(story) {
    const url = safeUrl(story.url);
    const hero = story.image
        ? `<tr><td style="padding:0 0 20px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="550" alt="" style="display:block;width:100%;max-width:550px;height:auto;border:1px solid ${BRAND.s800};background:${BRAND.s900};"></a></td></tr>`
        : '';
    const chip = tagChip(story.tag);
    return `
<tr><td class="px" style="background:${BRAND.s950};padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${hero}
    ${chip ? `<tr><td style="padding:0 0 10px;">${chip}</td></tr>` : ''}
    <tr><td><a href="${esc(url)}" style="font:700 20px/1.3 ${FONT};color:${BRAND.s100};text-decoration:none;">${esc(story.headline)}</a></td></tr>
    <tr><td style="padding:10px 0 0;"><p style="margin:0;font:400 15px/1.8 ${FONT};color:${BRAND.s300};">${esc(story.summary)}</p>${takeawayBlock(story)}${metaLine(story)}</td></tr>
  </table>
</td></tr>`;
}

// Key Themes row: stone-600 number, stone-100 semibold title, badge right, stone-400 body indented
function renderStory(story, n, isLast) {
    const url = safeUrl(story.url);
    const thumb = story.image
        ? `<td class="thumb" width="72" valign="top" style="padding:0 0 0 16px;width:72px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:cover;border:1px solid ${BRAND.s800};background:${BRAND.s900};"></a></td>`
        : '';
    const chip = tagChip(story.tag);
    const divider = isLast ? '' : `border-bottom:1px solid ${BRAND.s800_60};`;
    return `
<tr><td class="px" style="background:${BRAND.s950};${divider}padding:20px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="36" valign="top" style="width:36px;padding-top:4px;font:700 10px/1.4 ${FONT};color:${BRAND.s600};">${pad2(n)}</td>
    <td valign="top">
      ${chip ? `<div style="margin:0 0 8px;">${chip}</div>` : ''}
      <a href="${esc(url)}" style="font:600 16px/1.4 ${FONT};color:${BRAND.s100};text-decoration:none;">${esc(story.headline)}</a>
      <p style="margin:8px 0 0;font:400 14px/1.8 ${FONT};color:${BRAND.s400};">${esc(story.summary)}</p>
      ${takeawayBlock(story)}
      ${metaLine(story)}
    </td>
    ${thumb}
  </tr></table>
</td></tr>`;
}

function renderSection(section, num, skipFirst) {
    const stories = skipFirst ? section.stories.slice(1) : section.stories;
    if (stories.length === 0) return '';
    const rows = stories.map((s, i) => renderStory(s, i + 1, i === stories.length - 1)).join('');
    return sectionFrame(bandRow(num, section.label, false) + rows);
}

function renderDigestEmail({ digestName, dateStr, scannedCount, brief, inboxUrl, manageUrl }) {
    const allStories = brief.sections.flatMap(s => s.stories);
    const lead = allStories[0];
    const preheader = clip(stripTags(brief.lede || brief.title_line), 150);
    const countLine = `${allStories.length} ${allStories.length === 1 ? 'story' : 'stories'} from ${scannedCount} new ${scannedCount === 1 ? 'article' : 'articles'}`;

    // 01 Key signal: Key Takeaway block (border-l-4 primary, bg-stone-900) + stone-300 paragraph
    const keySignal = sectionFrame(bandRow(1, 'Key signal', true) + `
<tr><td class="px" style="background:${BRAND.s950};padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:${BRAND.s900};border-left:4px solid ${BRAND.primary};padding:16px 20px;">
      <p style="margin:0 0 8px;">${label('Key takeaway', BRAND.primary)}</p>
      <p class="title" style="margin:0;font:600 18px/1.45 ${FONT};color:${BRAND.s100};">${esc(brief.title_line)}</p>
    </td></tr>
  </table>
  ${brief.lede ? `<p style="margin:20px 0 0;font:400 15px/1.8 ${FONT};color:${BRAND.s300};">${esc(brief.lede)}</p>` : ''}
</td></tr>`);

    const leadBlock = lead ? sectionFrame(bandRow(2, 'Read first', false) + renderLead(lead)) : '';
    let n = lead ? 3 : 2;
    const sectionsHtml = brief.sections.map((s, i) => {
        const html = renderSection(s, n, i === 0);
        if (html) n++;
        return html;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(digestName)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${BRAND.shell}; }
  a { color:${BRAND.primary}; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:18px !important; padding-right:18px !important; }
    .title { font-size:17px !important; }
    .h2 { font-size:21px !important; }
    .thumb { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.shell};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.shell};">
<tr><td align="center" style="padding:24px 12px 40px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
    <!-- Wordmark (Layout: primary square + stone-100 bold tracking-tight) -->
    <tr><td style="padding:0 0 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="28" height="28" style="width:28px;height:28px;background:${BRAND.primary};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:10px;font:700 18px/1 ${FONT};letter-spacing:-0.025em;color:${BRAND.s100};">MergeRSS</td>
      </tr></table>
    </td></tr>

    <!-- Report header (bg-stone-950 border-stone-800 border-b-0 p-6) -->
    <tr><td class="px" style="background:${BRAND.s950};border:1px solid ${BRAND.s800};border-bottom:0;padding:24px;">
      <p style="margin:0 0 6px;">${label('Intelligence briefing', BRAND.primary, '0.2em')}</p>
      <h1 class="h2" style="margin:0;font:700 24px/1.25 ${FONT};color:${BRAND.s100};">${esc(digestName)}</h1>
      <p style="margin:6px 0 0;font:400 14px/1.5 ${FONT};color:${BRAND.s500};">${esc(dateStr)}<span style="color:${BRAND.s700};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>${esc(countLine)}</p>
    </td></tr>

    ${keySignal}
    ${leadBlock}
    ${sectionsHtml}

    <!-- CTA (Export PDF button style) -->
    ${sectionFrame(`<tr><td class="px" style="background:${BRAND.s950};padding:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="background:${BRAND.primary};">
          <a href="${esc(safeUrl(inboxUrl))}" style="display:inline-block;padding:12px 20px;font:600 14px/1 ${FONT};color:${BRAND.s900Text};text-decoration:none;">Open full briefing in MergeRSS</a>
        </td>
      </tr></table>
    </td></tr>`)}

    <!-- Footer -->
    <tr><td style="padding:20px 0 0;">
      <p style="margin:0;font:400 12px/1.6 ${FONT};color:${BRAND.s500};">
        You're receiving ${esc(digestName)} because email delivery is on for this digest.
        <a href="${esc(safeUrl(manageUrl))}" style="color:${BRAND.s400};text-decoration:underline;">Manage digest settings</a>
      </p>
      <p style="margin:8px 0 0;font:400 12px/1.6 ${FONT};color:${BRAND.s600};">Summaries are generated by MergeRSS from your sources. Check the original article before relying on any detail.</p>
    </td></tr>
  </table>

</td></tr>
</table>
</body>
</html>`;
}

// ── Email design system: MergeRSS brand (see BRAND.md at the app root) ──
// Dark-first, square-cornered, amber reserved for priority and brand.
// Alpha tints from the app are pre-blended to solid hex so Outlook renders them.
const BRAND = {
    field: '#0f0c0b',      // --background
    card: '#171412',       // --card
    rule: '#332c28',       // --border
    ruleSoft: '#25201d',   // --secondary
    text: '#f3eee8',       // --foreground
    secondary: '#d6cec2',  // --secondary-foreground
    body: '#c6baa9',       // .card-body
    muted: '#938876',      // --muted-foreground
    meta: '#78716c',       // stone-500
    dim: '#57534e',        // stone-600
    amber: '#f9a71a',      // --primary
    onAmber: '#0f0c0b',    // --primary-foreground
    amber50: '#885e16',    // primary / 50 on card
    amber60: '#9f6c17',    // primary / 60 on card
    amber25: '#503914',    // primary / 25 on card
    amber20: '#443114',    // primary / 20 on card
    amber7: '#271e13',     // primary / 7 on card
    amber4: '#201a12',     // primary / 4 on card
};
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const TAG_STYLE = {
    Risk: { fg: '#f87171', border: '#581816', bg: '#251110' },
    Opportunity: { fg: '#34d399', border: '#0e3a2c', bg: '#111b17' },
    Trending: { fg: '#60a5fa', border: '#1a2a60', bg: '#171926' },
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

function microLabel(text, color, spacing = '0.18em') {
    return `<span style="font:800 10px/1.4 ${FONT};letter-spacing:${spacing};text-transform:uppercase;color:${color};">${esc(text)}</span>`;
}

function tagChip(tag) {
    const st = TAG_STYLE[tag];
    if (!st) return '';
    return `<span style="display:inline-block;background:${st.bg};color:${st.fg};border:1px solid ${st.border};font:700 10px/1 ${FONT};letter-spacing:0.08em;text-transform:uppercase;padding:4px 6px;margin-right:6px;vertical-align:middle;">${esc(tag)}</span>`;
}

function readFirstChip() {
    return `<span style="display:inline-block;background:${BRAND.amber};color:${BRAND.onAmber};font:800 10px/1 ${FONT};letter-spacing:0.1em;text-transform:uppercase;padding:5px 7px;margin-right:6px;vertical-align:middle;">Read first</span>`;
}

// Source host plus the read link, one quiet line under each story.
function metaLine(story) {
    const url = safeUrl(story.url);
    const host = hostOf(url);
    const link = url
        ? `<a href="${esc(url)}" style="color:${BRAND.amber};text-decoration:none;font-weight:700;">Read source</a>`
        : '';
    const sep = host && link ? `<span style="color:${BRAND.dim};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` : '';
    return `<p style="margin:12px 0 0;font:500 12px/1.4 ${FONT};color:${BRAND.meta};">${esc(host)}${sep}${link}</p>`;
}

function takeawayBlock(story) {
    if (!story.takeaway) return '';
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
  <tr><td style="border-left:2px solid ${BRAND.amber60};padding:1px 0 1px 12px;">
    <p style="margin:0;font:400 14px/1.55 ${FONT};color:${BRAND.secondary};">${microLabel('Why this matters · ', BRAND.amber, '0.1em')}${esc(story.takeaway)}</p>
  </td></tr>
</table>`;
}

function renderLead(story) {
    const url = safeUrl(story.url);
    const hero = story.image
        ? `<tr><td style="padding:0 0 18px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="468" alt="" style="display:block;width:100%;max-width:468px;height:auto;border:1px solid ${BRAND.rule};background:${BRAND.ruleSoft};"></a></td></tr>`
        : '';
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="lead" style="background:${BRAND.amber4};border-left:4px solid ${BRAND.amber};padding:22px 24px 22px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${hero}
      <tr><td style="padding:0 0 10px;">${readFirstChip()}${tagChip(story.tag)}</td></tr>
      <tr><td style="padding:0 0 10px;"><a href="${esc(url)}" style="font:800 21px/1.3 ${FONT};letter-spacing:-0.01em;color:${BRAND.text};text-decoration:none;">${esc(story.headline)}</a></td></tr>
      <tr><td><p style="margin:0;font:400 15px/1.62 ${FONT};color:${BRAND.body};">${esc(story.summary)}</p>${takeawayBlock(story)}${metaLine(story)}</td></tr>
    </table>
  </td></tr>
</table>`;
}

function renderStory(story, isLastInSection) {
    const url = safeUrl(story.url);
    const thumb = story.image
        ? `<td class="thumb" width="88" valign="top" style="padding:0 0 0 18px;width:88px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="88" height="88" alt="" style="display:block;width:88px;height:88px;object-fit:cover;border:1px solid ${BRAND.rule};background:${BRAND.ruleSoft};"></a></td>`
        : '';
    const chip = tagChip(story.tag);
    const divider = isLastInSection ? '' : `<tr><td colspan="2" style="padding:0;"><div style="height:1px;line-height:1px;background:${BRAND.ruleSoft};font-size:0;">&nbsp;</div></td></tr>`;
    return `
<tr>
  <td valign="top" style="padding:20px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" style="border-left:2px solid ${BRAND.dim};padding:0 0 0 16px;">
        ${chip ? `<div style="margin:0 0 8px;">${chip}</div>` : ''}
        <a href="${esc(url)}" style="font:700 17px/1.35 ${FONT};letter-spacing:-0.005em;color:${BRAND.text};text-decoration:none;">${esc(story.headline)}</a>
        <p style="margin:8px 0 0;font:400 14.5px/1.6 ${FONT};color:${BRAND.body};">${esc(story.summary)}</p>
        ${takeawayBlock(story)}
        ${metaLine(story)}
      </td>
      ${thumb}
    </tr></table>
  </td>
</tr>${divider}`;
}

function renderSection(section, skipFirst) {
    const stories = skipFirst ? section.stories.slice(1) : section.stories;
    if (stories.length === 0) return '';
    return `
<tr><td class="px" style="padding:34px 32px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 0 10px;border-bottom:1px solid ${BRAND.rule};">${microLabel(section.label, BRAND.amber)}</td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${stories.map((s, i) => renderStory(s, i === stories.length - 1)).join('')}
  </table>
</td></tr>`;
}

function renderDigestEmail({ digestName, dateStr, scannedCount, brief, inboxUrl, manageUrl }) {
    const allStories = brief.sections.flatMap(s => s.stories);
    const lead = allStories[0];
    const preheader = clip(stripTags(brief.lede || brief.title_line), 150);
    const countLine = `${allStories.length} ${allStories.length === 1 ? 'story' : 'stories'} selected from ${scannedCount} new ${scannedCount === 1 ? 'article' : 'articles'}`;
    const ledeHtml = brief.lede
        ? `<p style="margin:14px 0 0;font:400 15px/1.62 ${FONT};color:${BRAND.secondary};">${esc(brief.lede)}</p>`
        : '';
    const sectionsHtml = brief.sections.map((s, i) => renderSection(s, i === 0)).join('');

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(digestName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${BRAND.field}; }
  a { color:${BRAND.amber}; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:20px !important; padding-right:20px !important; }
    .lead { padding:18px 16px 18px 16px !important; }
    .title { font-size:22px !important; }
    .thumb { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.field};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.field};">
<tr><td align="center" style="padding:28px 12px 40px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
    <!-- Wordmark -->
    <tr><td style="padding:0 2px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="24" height="24" style="width:24px;height:24px;background:${BRAND.amber};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:10px;font:700 17px/1 ${FONT};letter-spacing:-0.02em;color:${BRAND.text};">MergeRSS</td>
      </tr></table>
    </td></tr>

    <!-- Briefing card -->
    <tr><td style="background:${BRAND.card};border:2px solid ${BRAND.amber50};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <!-- Header band -->
        <tr><td class="px" style="background:${BRAND.amber7};border-bottom:1px solid ${BRAND.amber25};padding:13px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle">${microLabel(digestName, BRAND.amber)}</td>
            <td align="right" valign="middle" style="font:500 12px/1.3 ${FONT};color:${BRAND.meta};">${esc(dateStr)}</td>
          </tr></table>
        </td></tr>

        <!-- Key signal -->
        <tr><td class="px" style="background:${BRAND.amber4};border-bottom:1px solid ${BRAND.amber20};padding:26px 32px 26px;">
          <div style="margin:0 0 10px;">${microLabel("Today's key signal", BRAND.amber, '0.2em')}</div>
          <h1 class="title" style="margin:0;font:800 26px/1.25 ${FONT};letter-spacing:-0.02em;color:${BRAND.text};">${esc(brief.title_line)}</h1>
          ${ledeHtml}
          <p style="margin:14px 0 0;font:500 12px/1.4 ${FONT};color:${BRAND.meta};">${esc(countLine)}</p>
        </td></tr>

        <!-- Lead story -->
        <tr><td class="px" style="padding:28px 32px 0;">${lead ? renderLead(lead) : ''}</td></tr>

        ${sectionsHtml}

        <!-- CTA -->
        <tr><td class="px" align="left" style="padding:32px 32px 36px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:${BRAND.amber};">
              <a href="${esc(safeUrl(inboxUrl))}" style="display:inline-block;padding:14px 24px;font:800 12px/1 ${FONT};letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.onAmber};text-decoration:none;">Open in MergeRSS</a>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:22px 2px 0;">
      <p style="margin:0;font:400 12px/1.6 ${FONT};color:${BRAND.meta};">
        You're receiving ${esc(digestName)} because email delivery is on for this digest.
        <a href="${esc(safeUrl(manageUrl))}" style="color:${BRAND.secondary};text-decoration:underline;">Manage digest settings</a>
      </p>
      <p style="margin:8px 0 0;font:400 12px/1.6 ${FONT};color:${BRAND.dim};">Summaries are generated by MergeRSS from your sources. Check the original article before relying on any detail.</p>
    </td></tr>
  </table>

</td></tr>
</table>
</body>
</html>`;
}

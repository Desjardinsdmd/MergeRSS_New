import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ─── CANONICAL COPY: brand v3 + emailShell (source of truth: functions/lib/brand.ts) ──
// Design system v3 "briefing studio" (BRAND.md). Solid hex only so Outlook renders it,
// table layout, no webfont links. Keep every inlined copy in sync with lib/brand.ts.
const BRAND = {
    ink: '#0A0910', panel: '#17151F', raised: '#25222F', hairline: '#2A2636', line: '#363244',
    text: '#F3F1F7', body: '#C9C5D4', muted: '#A29DB1', meta: '#7C778B', faint: '#5C576B',
    violet: '#9B5CF6', violetDeep: '#7C3AED', violetLight: '#C4A5FD', chipBg: '#241B3A',
    emerald: '#34D399', emeraldBg: '#1A282B',
    red: '#F87171', redBg: '#2D1E27',
    sky: '#38BDF8', skyBg: '#1A2635',
    amber: '#FBBF24', amberBg: '#2E2620', amberBorder: '#503F20', // warnings only
    violetInt: 10181878, // Discord embed colour for #9B5CF6
    display: "'Space Grotesk', 'Segoe UI', Helvetica, Arial, sans-serif",
    sans: "Inter, 'Segoe UI', Helvetica, Arial, sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
    site: 'https://mergerss.com',
    name: 'MergeRSS',
    tagline: 'briefing studio',
    attribution: 'MergeRSS briefing',
    sentBy: 'Sent by MergeRSS, the briefing studio',
};
function brandEsc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function brandUrl(u) {
    try { const x = new URL(String(u)); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.toString() : ''; }
    catch { return ''; }
}
// Mono micro label / eyebrow (10px, uppercase, wide tracking).
function emailMicro(text, color) {
    return `<span style="font:600 10px/1.4 ${BRAND.mono};letter-spacing:0.14em;text-transform:uppercase;color:${color || BRAND.meta};">${brandEsc(text)}</span>`;
}
// Bulletproof primary button: violet fill, white text, 12px radius.
function emailButton(url, label) {
    const href = brandUrl(url);
    if (!href) return '';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
<td align="center" bgcolor="${BRAND.violet}" style="background:${BRAND.violet};border-radius:12px;">
<a href="${brandEsc(href)}" target="_blank" style="display:inline-block;padding:13px 22px;font:600 14px/1 ${BRAND.sans};color:#FFFFFF;text-decoration:none;border-radius:12px;">${brandEsc(label || 'Open in MergeRSS')}</a>
</td></tr></table>`;
}
// Rounded panel (20px radius, hairline border). innerHtml is trusted markup.
function emailPanel(innerHtml, opts = {}) {
    const pad = opts.padding || '24px';
    const border = opts.accent ? BRAND.violetDeep : BRAND.hairline;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${BRAND.panel};border:1px solid ${border};border-radius:20px;">
<tr><td class="px" style="padding:${pad};">${innerHtml}</td></tr></table>`;
}
// Amber warning card (warnings only: paused, skipped, needs attention).
function emailWarning(text) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${BRAND.amberBg};border:1px solid ${BRAND.amberBorder};border-radius:12px;">
<tr><td style="padding:12px 16px;font:500 13px/1.6 ${BRAND.sans};color:${BRAND.amber};">${brandEsc(text)}</td></tr></table>`;
}
// Full email document: ink page, logo lockup header, body slot, footer.
// bodyHtml is trusted markup (callers escape their own data). footerLinks: [{ label, url }].
function emailShell({ preheader, title, bodyHtml, footerNote, dateLabel, footerLinks }) {
    const links = (footerLinks || []).filter(l => l && brandUrl(l.url))
        .map(l => `<a href="${brandEsc(brandUrl(l.url))}" style="color:${BRAND.violetLight};text-decoration:underline;">${brandEsc(l.label)}</a>`)
        .join(`<span style="color:${BRAND.faint};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`);
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${brandEsc(title || BRAND.name)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${BRAND.ink}; }
  a { color:${BRAND.violetLight}; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:18px !important; padding-right:18px !important; }
    .h1 { font-size:24px !important; }
    .thumb { display:none !important; }
    .hide-sm { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.ink};" bgcolor="${BRAND.ink}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${brandEsc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.ink}" style="background:${BRAND.ink};">
<tr><td align="center" style="padding:28px 12px 44px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td style="padding:0 4px 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
        <td width="32" height="32" bgcolor="${BRAND.violet}" style="width:32px;height:32px;background:${BRAND.violet};border-radius:9px;font-size:0;line-height:0;">&nbsp;</td>
        <td valign="middle" style="padding-left:11px;">
          <div style="font:600 17px/1.1 ${BRAND.display};letter-spacing:-0.01em;color:${BRAND.text};">${BRAND.name}</div>
          <div style="font:400 10px/1.4 ${BRAND.mono};letter-spacing:0.08em;color:${BRAND.meta};">${BRAND.tagline}</div>
        </td>
      </tr></table>
    </td>
    ${dateLabel ? `<td align="right" valign="middle" style="font:500 11px/1.4 ${BRAND.mono};letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.meta};">${brandEsc(dateLabel)}</td>` : ''}
  </tr></table>
</td></tr>
<tr><td>${bodyHtml || ''}</td></tr>
<tr><td style="padding:24px 4px 0;">
  ${footerNote ? `<p style="margin:0 0 10px;font:400 12px/1.6 ${BRAND.sans};color:${BRAND.meta};">${brandEsc(footerNote)}</p>` : ''}
  ${links ? `<p style="margin:0 0 10px;font:400 12px/1.6 ${BRAND.sans};color:${BRAND.meta};">${links}</p>` : ''}
  <p style="margin:0;font:400 11px/1.6 ${BRAND.mono};letter-spacing:0.04em;color:${BRAND.faint};">${brandEsc(BRAND.sentBy)} &middot; <a href="${BRAND.site}" style="color:${BRAND.faint};text-decoration:underline;">mergerss.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
// ─── end CANONICAL COPY: brand v3 ──────────────────────────────────────────


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const testEmail = 'test@mergerss.com';
    const testPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 16) + 'Aa1!';
    
    // Invite test user
    await base44.users.inviteUser(testEmail, 'user');
    
    // Send password reset email so they can set their password
    await base44.integrations.Core.SendEmail({
      to: testEmail,
      subject: 'MergeRSS Test Account - Set Your Password',
      body: `Your test account has been created.\n\nEmail: ${testEmail}\n\nClick here to set your password: ${new URL('/reset-password', new URL(req.url).origin).href}\n\nFor testing, you can use password: ${testPassword}`
    });

    // Create sample feeds for the test user
    const feeds = await base44.asServiceRole.entities.Feed.bulkCreate([
      {
        name: 'TechCrunch',
        url: 'https://techcrunch.com/feed/',
        category: 'Tech',
        tags: ['startups', 'innovation'],
        status: 'active',
        created_by: testEmail
      },
      {
        name: 'The Verge',
        url: 'https://www.theverge.com/rss/index.xml',
        category: 'Tech',
        tags: ['gadgets', 'reviews'],
        status: 'active',
        created_by: testEmail
      },
      {
        name: 'Bloomberg Markets',
        url: 'https://feeds.bloomberg.com/markets/news.rss',
        category: 'Finance',
        tags: ['markets', 'investing'],
        status: 'active',
        created_by: testEmail
      },
      {
        name: 'Hacker News',
        url: 'https://news.ycombinator.com/rss',
        category: 'Tech',
        tags: ['programming', 'ai'],
        status: 'active',
        created_by: testEmail
      },
      {
        name: 'Crypto News',
        url: 'https://feeds.bloomberg.com/markets/cryptocurrency.rss',
        category: 'Crypto',
        tags: ['blockchain', 'bitcoin'],
        status: 'active',
        created_by: testEmail
      }
    ]);

    // Create sample articles for test feeds
    const articles = [];
    for (let i = 0; i < feeds.length; i++) {
      for (let j = 0; j < 8; j++) {
        articles.push({
          feed_id: feeds[i].id,
          title: `${feeds[i].name} Article ${j + 1}: Lorem ipsum dolor sit amet consectetur`,
          url: `https://example.com/article-${i}-${j}`,
          description: `This is a test article from ${feeds[i].name}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
          author: `Author ${j + 1}`,
          published_date: new Date(Date.now() - (j * 86400000)).toISOString(),
          category: feeds[i].category,
          tags: feeds[i].tags,
          is_read: j > 4,
          created_by: testEmail
        });
      }
    }

    if (articles.length > 0) {
      await base44.asServiceRole.entities.FeedItem.bulkCreate(articles);
    }

    // Create sample digest
    await base44.asServiceRole.entities.Digest.create({
      name: 'Daily Tech Digest',
      description: 'Daily roundup of tech news',
      categories: ['Tech'],
      frequency: 'daily',
      schedule_time: '09:00',
      output_length: 'medium',
      delivery_web: true,
      delivery_email: false,
      status: 'active',
      created_by: testEmail
    });

    return Response.json({ 
      message: 'Test user setup complete',
      email: testEmail,
      feedsCreated: feeds.length,
      articlesCreated: articles.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
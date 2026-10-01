import { useEffect } from 'react';

export const SITE_ORIGIN = 'https://mergerss.com';
export const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Per-page head tags for the public pages. Sets the title, description, Open Graph, Twitter
 * and canonical tags on mount (creating any that are missing). `path` is relative to the
 * canonical origin, e.g. "/" or "/Pricing". `jsonLd` (optional) is injected as a
 * structured-data script and removed again when the page unmounts.
 */
export default function Seo({ title, description, path = '/', jsonLd }) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const url = `${SITE_ORIGIN}${path}`;
    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', 'MergeRSS');
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:image', OG_IMAGE);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', OG_IMAGE);
    upsertCanonical(url);

    let script = null;
    if (ld) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'page');
      script.text = ld;
      document.head.appendChild(script);
    }
    return () => { if (script) script.remove(); };
  }, [title, description, path, ld]);
  return null;
}

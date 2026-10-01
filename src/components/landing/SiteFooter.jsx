import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Logo } from '@/components/brand/Brand';

const LINK = 'rounded-sm text-sm text-stone-400 transition hover:text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]';

/** Footer shared by the public pages (Landing, Pricing, Privacy, Terms). */
export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link to={createPageUrl('Landing')} aria-label="MergeRSS home" className="w-fit rounded-xl">
          <Logo />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link to={createPageUrl('Pricing')} className={LINK}>Pricing</Link>
          <Link to={createPageUrl('Privacy')} className={LINK}>Privacy</Link>
          <Link to={createPageUrl('Terms')} className={LINK}>Terms</Link>
          <a href="mailto:support@mergerss.com" className={LINK}>support@mergerss.com</a>
        </nav>
        <p className="font-mono text-[11px] text-stone-500">© 2026 MergeRSS</p>
      </div>
    </footer>
  );
}

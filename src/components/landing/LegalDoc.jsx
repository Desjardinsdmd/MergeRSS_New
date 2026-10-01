import React from 'react';
import Reveal from '@/components/landing/Reveal';
import SiteFooter from '@/components/landing/SiteFooter';
import Seo from '@/components/landing/Seo';

/** Inline link style for legal copy. */
export const legalLink = 'rounded-sm text-brand-light underline decoration-[hsl(var(--brand)/0.4)] underline-offset-4 transition hover:text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]';

/** Bulleted list for legal sections. */
export function LegalList({ items }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[0.7em] h-1 w-1 flex-shrink-0 rounded-full bg-[hsl(var(--brand))]" aria-hidden="true" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Readable document layout for Privacy and Terms.
 * `sections`: [{ title, body }] where body is any node. Numbers are generated (01, 02 ...).
 */
export default function LegalDoc({ eyebrow, title, updated, intro, sections, seo }) {
  return (
    <div className="overflow-x-clip">
      {seo && <Seo {...seo} />}
      <article className="mx-auto max-w-3xl px-4 pb-4 pt-12 sm:px-6 sm:pt-16">
        <header className="animate-fade-up">
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h1 className="font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-stone-100 sm:text-5xl">{title}</h1>
          <p className="meta mt-4">Last updated · {updated}</p>
          {intro && <p className="mt-6 text-[15px] leading-relaxed text-stone-300">{intro}</p>}
        </header>

        <nav aria-label="Sections" className="panel mt-10 p-5 animate-fade-up [animation-delay:80ms]">
          <p className="micro-label mb-3">Contents</p>
          <ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.title} className="min-w-0">
                <a
                  href={`#section-${i + 1}`}
                  className="flex items-baseline gap-3 rounded-sm text-sm text-stone-300 transition hover:text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                >
                  <span className="font-mono text-[11px] text-stone-500">{String(i + 1).padStart(2, '0')}</span>
                  <span className="truncate">{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-12">
          {sections.map((s, i) => (
            <Reveal as="section" key={s.title} id={`section-${i + 1}`} aria-labelledby={`section-${i + 1}-title`} className="scroll-mt-28">
              <div className="flex items-baseline gap-4 border-b border-white/[0.06] pb-3">
                <span className="font-mono text-xs font-medium text-[hsl(var(--brand))]">{String(i + 1).padStart(2, '0')}</span>
                <h2 id={`section-${i + 1}-title`} className="font-display text-xl font-semibold tracking-tight text-stone-100 sm:text-2xl">
                  {s.title}
                </h2>
              </div>
              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-stone-300">{s.body}</div>
            </Reveal>
          ))}
        </div>
      </article>
      <SiteFooter />
    </div>
  );
}

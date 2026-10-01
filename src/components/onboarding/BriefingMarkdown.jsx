import React from 'react';
import ReactMarkdown from 'react-markdown';
import { safeUrl } from '@/components/utils/htmlUtils';

// Dark-theme markdown for a delivered briefing. Raw HTML is not rendered (react-markdown
// default); links go through safeUrl and open in a new tab.
const COMPONENTS = {
  h1: ({ node, ...p }) => <h2 className="font-display text-lg font-semibold text-stone-100 mt-5 mb-2" {...p} />,
  h2: ({ node, ...p }) => <h3 className="font-display text-base font-semibold text-stone-100 mt-5 mb-2" {...p} />,
  h3: ({ node, ...p }) => <h4 className="text-sm font-semibold text-stone-200 mt-4 mb-1.5" {...p} />,
  h4: ({ node, ...p }) => <h5 className="text-sm font-semibold text-stone-300 mt-3 mb-1" {...p} />,
  p: ({ node, ...p }) => <p className="text-sm text-stone-400 leading-relaxed my-2" {...p} />,
  ul: ({ node, ...p }) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-stone-400" {...p} />,
  ol: ({ node, ...p }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-stone-400" {...p} />,
  li: ({ node, ...p }) => <li className="leading-relaxed" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-stone-200" {...p} />,
  em: ({ node, ...p }) => <em className="italic" {...p} />,
  blockquote: ({ node, ...p }) => <blockquote className="border-l-2 border-[hsl(var(--primary)/0.6)] pl-3 my-3 text-stone-500 italic" {...p} />,
  hr: () => <hr className="my-4 border-white/[0.07]" />,
  code: ({ node, inline, ...p }) => <code className="bg-white/[0.06] text-stone-200 rounded-md px-1 py-0.5 font-mono text-xs" {...p} />,
  pre: ({ node, ...p }) => <pre className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 font-mono overflow-x-auto text-xs my-3" {...p} />,
  a: ({ node, href, children, ...p }) => (
    <a
      {...p}
      href={safeUrl(href)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#C4A5FD] underline underline-offset-2 hover:opacity-80 break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] rounded-md"
    >
      {children}
    </a>
  ),
  img: () => null,
};

export default function BriefingMarkdown({ content }) {
  if (!content) return <p className="text-sm text-stone-500">No content in this briefing.</p>;
  return (
    <div className="max-w-none break-words">
      <ReactMarkdown components={COMPONENTS}>{String(content)}</ReactMarkdown>
    </div>
  );
}

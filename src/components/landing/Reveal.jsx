import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Returns [ref, inView]. Fires once, the first time the element scrolls into view. */
export function useInView(options = { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        obs.disconnect();
      }
    }, options);
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, inView];
}

/** Fades its children up (tailwind `animate-fade-up`) the first time they scroll into view. */
export default function Reveal({ as: Tag = 'div', delay = 0, className, style, children, ...rest }) {
  const [ref, inView] = useInView();
  return (
    <Tag
      ref={ref}
      className={cn(inView ? 'animate-fade-up' : 'opacity-0', className)}
      style={inView && delay ? { ...style, animationDelay: `${delay}ms` } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Counts from 0 to `value` once visible. Shows the final value at once under reduced motion. */
export function useCountUp(value, active, duration = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    if (prefersReducedMotion() || !value) {
      setN(value || 0);
      return undefined;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active, duration]);
  return n;
}

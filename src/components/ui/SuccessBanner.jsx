import React, { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SuccessBanner — transient confirmation banner
 * Props:
 *   message  string   – what to show
 *   show     boolean  – controlled visibility
 *   onHide   fn       – called after auto-dismiss or manual close
 *   duration number   – ms before auto-dismiss (default 3500)
 */
export default function SuccessBanner({ message, show, onHide, duration = 3500 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        onHide?.();
      }, duration);
      return () => clearTimeout(t);
    }
  }, [show, duration]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 px-4 py-3 mb-4 bg-emerald-900/40 border border-emerald-700 text-emerald-300 text-sm font-medium animate-in rounded-none"
      )}
    >
      <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <button
        onClick={() => { setVisible(false); onHide?.(); }}
        aria-label="Dismiss notification"
        className="p-0.5 hover:text-emerald-100 transition-colors"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
import React, { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Palette, Moon, Contrast } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MicroLabel } from '@/components/brand/Brand';

// v3 is dark-only. Light and System modes were removed; any stored value other than
// 'hc-dark' renders as the standard dark theme.
const THEMES = [
  { id: 'dark',    label: 'Dark',          icon: Moon,     preview: 'bg-stone-950 border-white/15' },
  { id: 'hc-dark', label: 'High contrast', icon: Contrast, preview: 'bg-black border-white' },
];

// The first option is the brand default and matches --brand in globals.css.
// The logo always stays brand violet; the accent only recolours buttons, links and highlights.
export const ACCENT_COLORS = [
  { id: 'violet',  label: 'Violet',  color: 'hsl(265 90% 66%)',  hsl: '265 90% 66%' },
  { id: 'coral',   label: 'Coral',   color: 'hsl(348 100% 65%)', hsl: '348 100% 65%' },
  { id: 'cyan',    label: 'Cyan',    color: 'hsl(187 100% 50%)', hsl: '187 100% 50%' },
  { id: 'emerald', label: 'Emerald', color: 'hsl(156 100% 50%)', hsl: '156 100% 50%' },
  { id: 'magenta', label: 'Magenta', color: 'hsl(333 100% 59%)', hsl: '333 100% 59%' },
];

const DEFAULT_ACCENT = ACCENT_COLORS[0];

/** Resolves a stored accent id to a palette entry; unknown or legacy ids (indigo, amber) fall back to violet. */
export function resolveAccent(colorId) {
  return ACCENT_COLORS.find(c => c.id === colorId) || DEFAULT_ACCENT;
}

/** Applies accent color CSS variables to :root immediately */
export function applyAccentColor(colorId) {
  const c = resolveAccent(colorId);
  document.documentElement.style.setProperty('--accent-primary', c.hsl);
  document.documentElement.style.setProperty('--primary', c.hsl);
  document.documentElement.style.setProperty('--ring', c.hsl);
  try {
    localStorage.setItem('theme-accent', c.id);
  } catch (e) {
    // storage unavailable (private mode); the accent still applies for this session
  }
}

/** Applies high-contrast overrides when hc-dark is active (WCAG AAA ≥7:1 contrast) */
function applyHCOverrides(isHC) {
  const root = document.documentElement;
  if (isHC) {
    root.style.setProperty('--background', '0 0% 0%');
    root.style.setProperty('--foreground', '0 0% 100%');
    root.style.setProperty('--card', '0 0% 8%');
    root.style.setProperty('--card-foreground', '0 0% 100%');
    root.style.setProperty('--border', '0 0% 100%');
    root.style.setProperty('--muted', '0 0% 12%');
    root.style.setProperty('--muted-foreground', '0 0% 85%');
    root.style.setProperty('--input', '0 0% 20%');
    root.style.setProperty('--destructive', '0 100% 45%');
    root.style.setProperty('--ring', '265 95% 74%');
  } else {
    root.style.removeProperty('--background');
    root.style.removeProperty('--foreground');
    root.style.removeProperty('--card');
    root.style.removeProperty('--card-foreground');
    root.style.removeProperty('--border');
    root.style.removeProperty('--muted');
    root.style.removeProperty('--muted-foreground');
    root.style.removeProperty('--input');
    root.style.removeProperty('--destructive');
    root.style.removeProperty('--ring');
  }
}

export default function ThemeSettings({ accentColor, onAccentChange, onAutoSave }) {
  const { theme, setTheme } = useTheme();
  const activeTheme = theme === 'hc-dark' ? 'hc-dark' : 'dark';
  const activeAccent = resolveAccent(accentColor);

  // Apply saved accent on mount and whenever it changes
  useEffect(() => {
    if (accentColor) applyAccentColor(accentColor);
  }, [accentColor]);

  // Apply HC overrides whenever theme changes
  useEffect(() => {
    if (theme === 'hc-dark') {
      document.documentElement.classList.add('dark');
      applyHCOverrides(true);
    } else {
      applyHCOverrides(false);
    }
  }, [theme]);

  const handleThemeChange = (id) => {
    setTheme(id);
    if (id === 'hc-dark') {
      document.documentElement.classList.add('dark');
      applyHCOverrides(true);
    } else {
      applyHCOverrides(false);
    }
    if (onAutoSave) onAutoSave(id);
  };

  const handleAccentChange = (colorId) => {
    onAccentChange(colorId);
    applyAccentColor(colorId);
    if (onAutoSave) onAutoSave(colorId);
  };

  return (
    <section className="panel p-6" aria-labelledby="appearance-heading">
      <div className="mb-5 flex items-center gap-2">
        <Palette className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
        <h2 id="appearance-heading" className="font-display text-lg font-semibold text-stone-100">Appearance</h2>
      </div>

      <div className="space-y-6">
        {/* Colour mode */}
        <div>
          <MicroLabel className="mb-1">Colour mode</MicroLabel>
          <p className="mb-3 text-xs text-stone-500">Changes apply instantly</p>
          <div className="grid max-w-sm grid-cols-2 gap-3">
            {THEMES.map(t => {
              const Icon = t.icon;
              const isActive = activeTheme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleThemeChange(t.id)}
                  aria-pressed={isActive}
                  aria-label={`${t.label} theme`}
                  title={`Switch to ${t.label} mode`}
                  className={cn(
                    'group flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
                    isActive
                      ? 'border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.12)]'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/[0.03]'
                  )}
                >
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg border', t.preview)}>
                    <Icon className={cn('h-5 w-5 transition-colors', isActive ? 'text-[hsl(var(--primary))]' : 'text-stone-400')} aria-hidden="true" />
                  </div>
                  <span className={cn('text-xs font-medium transition-colors', isActive ? 'text-stone-100' : 'text-stone-500')}>
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent colour */}
        <div>
          <MicroLabel className="mb-1">Accent colour</MicroLabel>
          <p className="mb-3 text-xs text-stone-500">Applied to buttons, links and highlights. The MergeRSS logo stays violet.</p>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Accent color">
            {ACCENT_COLORS.map(c => {
              const isActive = activeAccent.id === c.id;
              return (
                <div key={c.id} className="group/swatch relative">
                  <button
                    onClick={() => handleAccentChange(c.id)}
                    role="radio"
                    aria-checked={isActive}
                    aria-label={`${c.label} accent color`}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900',
                      isActive ? 'scale-110 border-white shadow-lg' : 'border-transparent hover:scale-105 hover:border-stone-400'
                    )}
                    style={{ backgroundColor: c.color }}
                  >
                    {isActive && <span className="block h-2.5 w-2.5 rounded-full bg-white/90" aria-hidden="true" />}
                  </button>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-stone-900 px-2 py-1 text-xs text-stone-100 opacity-0 transition-opacity duration-150 group-hover/swatch:opacity-100">
                    {c.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live preview */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div
              className="flex h-8 items-center justify-center rounded-xl px-4 text-xs font-semibold text-white"
              style={{ backgroundColor: activeAccent.color }}
            >
              Live preview
            </div>
            <div
              className="flex h-8 items-center justify-center rounded-xl border px-4 text-xs font-medium"
              style={{ color: activeAccent.color, borderColor: activeAccent.color }}
            >
              Outline variant
            </div>
            <span className="meta">
              Active: <span className="text-stone-300">{activeAccent.label}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

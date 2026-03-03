import React, { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Palette, Sun, Moon, Monitor, Contrast } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const THEMES = [
  { id: 'dark',    label: 'Dark',    icon: Moon,     preview: 'bg-stone-900 border-stone-700' },
  { id: 'light',   label: 'Light',   icon: Sun,      preview: 'bg-stone-100 border-stone-300' },
  { id: 'system',  label: 'System',  icon: Monitor,  preview: 'bg-gradient-to-br from-stone-900 to-stone-200 border-stone-500' },
  { id: 'hc-dark', label: 'High Contrast', icon: Contrast, preview: 'bg-black border-white' },
];

export const ACCENT_COLORS = [
  { id: 'amber',   label: 'Amber',   color: '#fbbf24', hsl: '38 95% 54%' },
  { id: 'indigo',  label: 'Indigo',  color: '#6366f1', hsl: '239 84% 67%' },
  { id: 'violet',  label: 'Violet',  color: '#8b5cf6', hsl: '263 70% 64%' },
  { id: 'blue',    label: 'Blue',    color: '#3b82f6', hsl: '217 91% 60%' },
  { id: 'emerald', label: 'Emerald', color: '#10b981', hsl: '160 84% 39%' },
  { id: 'rose',    label: 'Rose',    color: '#f43f5e', hsl: '350 89% 60%' },
];

/** Applies accent color CSS variables to :root immediately */
export function applyAccentColor(colorId) {
  const c = ACCENT_COLORS.find(c => c.id === colorId);
  if (c) {
    document.documentElement.style.setProperty('--accent-primary', c.hsl);
    document.documentElement.style.setProperty('--primary', c.hsl);
    document.documentElement.style.setProperty('--ring', c.hsl);
    localStorage.setItem('theme-accent', colorId);
  }
}

/** Applies high-contrast overrides when hc-dark is active */
function applyHCOverrides(isHC) {
  const root = document.documentElement;
  if (isHC) {
    root.style.setProperty('--background', '0 0% 0%');
    root.style.setProperty('--foreground', '0 0% 100%');
    root.style.setProperty('--border', '0 0% 50%');
    root.style.setProperty('--muted-foreground', '0 0% 85%');
  } else {
    // Remove inline overrides so CSS vars take back control
    root.style.removeProperty('--background');
    root.style.removeProperty('--foreground');
    root.style.removeProperty('--border');
    root.style.removeProperty('--muted-foreground');
  }
}

export default function ThemeSettings({ accentColor, onAccentChange, onAutoSave }) {
  const { theme, setTheme } = useTheme();

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
  };

  const handleAccentChange = (colorId) => {
    onAccentChange(colorId);
    applyAccentColor(colorId);
    // Auto-save immediately so the user sees instant feedback
    if (onAutoSave) onAutoSave(colorId);
  };

  return (
    <Card className="border-stone-800 bg-stone-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-stone-200">
         <Palette className="w-5 h-5 text-[hsl(var(--primary))]" aria-hidden="true" />
         Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ── Color Mode ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-stone-300 mb-3">Color Mode</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {THEMES.map(t => {
              const Icon = t.icon;
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleThemeChange(t.id)}
                  aria-pressed={isActive}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
                    isActive
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))/0.1]'
                      : 'border-stone-700 hover:border-stone-500'
                  )}
                >
                  <div className={cn('w-10 h-10 rounded-md border-2 flex items-center justify-center', t.preview)}>
                    <Icon className={cn('w-5 h-5', isActive ? 'text-[hsl(var(--primary))]' : 'text-stone-400')} />
                  </div>
                  <span className={cn('text-xs font-medium', isActive ? 'text-[hsl(var(--primary))]' : 'text-stone-500')}>
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Accent Color ────────────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-stone-300 mb-1">Accent Color</p>
          <p className="text-xs text-stone-500 mb-3">Applied to buttons, links and highlights throughout the app.</p>
          <div className="flex gap-3 flex-wrap" role="radiogroup" aria-label="Accent color">
            {ACCENT_COLORS.map(c => {
              const isActive = accentColor === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => handleAccentChange(c.id)}
                  role="radio"
                  aria-checked={isActive}
                  aria-label={c.label}
                  title={c.label}
                  className={cn(
                    'w-9 h-9 rounded-full border-2 transition-all duration-150 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-white',
                    isActive ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105 hover:border-stone-400'
                  )}
                  style={{ backgroundColor: c.color }}
                >
                  {isActive && <span className="w-2.5 h-2.5 rounded-full bg-white/90 block" />}
                </button>
              );
            })}
          </div>

          {/* Live preview swatch */}
          <div className="mt-4 flex items-center gap-3">
            <div
              className="h-8 px-4 flex items-center justify-center text-xs font-semibold"
              style={{
                backgroundColor: ACCENT_COLORS.find(c => c.id === accentColor)?.color || '#fbbf24',
                color: '#0a0805',
              }}
            >
              Live preview
            </div>
            <div
              className="h-8 px-4 flex items-center justify-center text-xs font-medium border"
              style={{
                color: ACCENT_COLORS.find(c => c.id === accentColor)?.color || '#fbbf24',
                borderColor: ACCENT_COLORS.find(c => c.id === accentColor)?.color || '#fbbf24',
              }}
            >
              Outline variant
            </div>
            <span className="text-xs text-stone-500">
              Active: <span className="text-stone-300 font-medium">{ACCENT_COLORS.find(c => c.id === accentColor)?.label || 'Amber'}</span>
            </span>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
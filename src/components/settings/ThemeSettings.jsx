import React, { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Palette, Sun, Moon, Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun, preview: 'bg-stone-900 border-stone-800' },
  { id: 'dark', label: 'Dark', icon: Moon, preview: 'bg-stone-900 border-stone-700' },
  { id: 'system', label: 'System', icon: Monitor, preview: 'bg-gradient-to-br from-stone-900 to-stone-800 border-stone-700' },
];

const ACCENT_COLORS = [
  { id: 'amber', label: 'Amber', color: '#d97706', hsl: '32 97% 44%' },
  { id: 'indigo', label: 'Indigo', color: '#4f46e5', hsl: '245 82% 60%' },
  { id: 'violet', label: 'Violet', color: '#7c3aed', hsl: '262 73% 56%' },
  { id: 'blue', label: 'Blue', color: '#2563eb', hsl: '219 85% 54%' },
  { id: 'emerald', label: 'Emerald', color: '#059669', hsl: '161 93% 30%' },
  { id: 'rose', label: 'Rose', color: '#e11d48', hsl: '347 87% 50%' },
];

function applyAccentColor(colorId) {
  const c = ACCENT_COLORS.find(c => c.id === colorId);
  if (c) {
    document.documentElement.style.setProperty('--primary', c.hsl);
    document.documentElement.style.setProperty('--ring', c.hsl);
  }
}

export default function ThemeSettings({ accentColor, onAccentChange }) {
  const { theme, setTheme } = useTheme();

  // Apply saved accent color on mount
  useEffect(() => {
    if (accentColor) applyAccentColor(accentColor);
  }, [accentColor]);

  const handleAccentChange = (colorId) => {
    onAccentChange(colorId);
    applyAccentColor(colorId);
  };

  return (
    <Card className="border-stone-800 bg-stone-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-stone-200">
          <Palette className="w-5 h-5 text-amber-400" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme mode */}
        <div>
          <p className="text-sm font-medium text-stone-200 mb-3">Color Mode</p>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map(t => {
              const Icon = t.icon;
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                    isActive
                      ? 'border-amber-400 bg-amber-950 dark:bg-amber-950'
                      : 'border-stone-700 hover:border-stone-600 dark:border-stone-700'
                  )}
                >
                  <div className={cn('w-10 h-10 rounded-lg border flex items-center justify-center', t.preview)}>
                    <Icon className={cn('w-5 h-5', t.id === 'dark' ? 'text-amber-400' : 'text-stone-300')} />
                  </div>
                  <span className={cn('text-xs font-medium', isActive ? 'text-amber-400 dark:text-amber-400' : 'text-stone-500 dark:text-stone-400')}>
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent color */}
        <div>
          <p className="text-sm font-medium text-stone-200 mb-3">Accent Color</p>
          <div className="flex gap-3 flex-wrap">
            {ACCENT_COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => handleAccentChange(c.id)}
                title={c.label}
                className={cn(
                  'w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center',
                  accentColor === c.id ? 'border-white scale-110 shadow-md' : 'border-transparent hover:scale-105 hover:border-stone-500'
                )}
                style={{ backgroundColor: c.color }}
              >
                {accentColor === c.id && (
                  <span className="w-2.5 h-2.5 rounded-full bg-white/80 block" />
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-2">Updates the accent color throughout the app.</p>
        </div>
      </CardContent>
    </Card>
  );
}
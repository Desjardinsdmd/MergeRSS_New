import React from 'react';
import { useTheme } from 'next-themes';
import { Palette, Sun, Moon, Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun, preview: 'bg-white border-slate-200' },
  { id: 'dark', label: 'Dark', icon: Moon, preview: 'bg-slate-900 border-slate-700' },
  { id: 'system', label: 'System', icon: Monitor, preview: 'bg-gradient-to-br from-white to-slate-900 border-slate-300' },
];

const ACCENT_COLORS = [
  { id: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { id: 'violet', label: 'Violet', color: '#7c3aed' },
  { id: 'blue', label: 'Blue', color: '#2563eb' },
  { id: 'emerald', label: 'Emerald', color: '#059669' },
  { id: 'rose', label: 'Rose', color: '#e11d48' },
  { id: 'amber', label: 'Amber', color: '#d97706' },
];

export default function ThemeSettings({ accentColor, onAccentChange }) {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="border-slate-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="w-5 h-5 text-slate-400" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme mode */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-3">Color Mode</p>
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
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  )}
                >
                  <div className={cn('w-10 h-10 rounded-lg border flex items-center justify-center', t.preview)}>
                    <Icon className={cn('w-5 h-5', t.id === 'dark' ? 'text-white' : 'text-slate-700')} />
                  </div>
                  <span className={cn('text-xs font-medium', isActive ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400')}>
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent color */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-3">Accent Color</p>
          <div className="flex gap-2 flex-wrap">
            {ACCENT_COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => onAccentChange(c.id)}
                title={c.label}
                className={cn(
                  'w-8 h-8 rounded-full border-2 transition-all',
                  accentColor === c.id ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">Accent color customization coming soon — currently applies to highlights.</p>
        </div>
      </CardContent>
    </Card>
  );
}
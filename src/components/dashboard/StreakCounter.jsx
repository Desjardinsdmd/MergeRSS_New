import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Flame } from 'lucide-react';

export default function StreakCounter({ user }) {
  const [streak, setStreak] = useState(0);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (!user) return;

    const today = new Date().toDateString();
    const lastVisit = user.last_visit_date;
    const currentStreak = user.login_streak || 0;

    if (lastVisit === today) {
      // Already visited today
      setStreak(currentStreak);
      return;
    }

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const newStreak = lastVisit === yesterday ? currentStreak + 1 : 1;
    const isNewStreak = newStreak > currentStreak;

    setStreak(newStreak);
    setIsNew(isNewStreak && newStreak > 1);

    base44.auth.updateMe({
      last_visit_date: today,
      login_streak: newStreak,
    }).catch(() => {});
  }, [user]);

  const displayStreak = streak;
  if (displayStreak < 1) return null;

  return (
    <div
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        isNew
          ? 'border-[hsl(var(--brand)/0.35)] bg-[hsl(var(--brand)/0.14)] text-stone-100'
          : 'border-white/10 bg-white/[0.03] text-stone-300'
      }`}
    >
      <Flame className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
      <span>{displayStreak}-day streak</span>
    </div>
  );
}

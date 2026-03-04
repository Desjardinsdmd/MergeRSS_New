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
    <div className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all flex-shrink-0 ${
      isNew
        ? 'bg-[hsl(var(--primary))] text-stone-900 animate-pulse'
        : 'bg-stone-800 text-[hsl(var(--primary))]'
    }`}>
      <Flame className="w-4 h-4" />
      <span>{displayStreak}-day streak</span>
      {isNew && <span className="text-xs font-normal opacity-70">🎉</span>}
    </div>
  );
}
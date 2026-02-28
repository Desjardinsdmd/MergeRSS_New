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

  if (streak < 2) return null;

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
      isNew
        ? 'bg-orange-100 text-orange-700 animate-pulse'
        : 'bg-orange-50 text-orange-600'
    }`}>
      <Flame className="w-4 h-4" />
      <span>{streak}-day streak</span>
      {isNew && <span className="text-xs font-normal opacity-70">🎉</span>}
    </div>
  );
}
'use client';

import { useAuthStore, selectIsHydrated, selectUser } from '@/store/auth.store';
import { useEffect, useState } from 'react';

/**
 * PLAN Phase 1 (خطة الرئيسية المُعدّلة، القسم 3): يستبدل نص HeroBanner
 * الترحيبي بسطر مضغوط، فسحًا لمحتوى حقيقي (FeaturedCarousel) أعلى
 * الشاشة الأولى بدل بانر نصّي بلا صور.
 *
 * غير مسجّل الدخول → لا يُعرض شيء (الترحيب الشخصي لا معنى له بلا اسم)؛
 * الصفحة تبدأ مباشرة بـ FeaturedCarousel.
 */
function greeting(hour: number): string {
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'مساء الخير';
  return 'مساء الخير';
}

export function WelcomeBar() {
  const user = useAuthStore(selectUser);
  const isHydrated = useAuthStore(selectIsHydrated);
  const [greetingText, setGreetingText] = useState('مساء الخير');

  useEffect(() => {
    setGreetingText(greeting(new Date().getHours()));
  }, []);

  if (!isHydrated || !user) return null;

  const firstName = user.name?.split(' ')[0] ?? user.name;

  return (
    <div className="container mx-auto max-w-7xl px-4 pt-4">
      <p className="text-sm text-muted-foreground">
        {greetingText}، <span className="font-semibold text-foreground">{firstName}</span> 👋
      </p>
    </div>
  );
}

'use client';

import { useAuthStore, selectIsHydrated, selectUser } from '@/store/auth.store';
import { useEffect, useState } from 'react';

/**
 * PLAN (خطة الرئيسية المُعدّلة، القسم 3): يستبدل نص HeroBanner
 * الترحيبي بسطر مضغوط، فسحًا لمحتوى حقيقي (FeaturedCarousel) أعلى
 * الشاشة الأولى بدل بانر نصّي بلا صور.
 *
 * غير مسجّل الدخول → لا يُعرض شيء (الترحيب الشخصي لا معنى له بلا اسم)؛
 * الصفحة تبدأ مباشرة بـ FeaturedCarousel.
 */
export function greeting(hour: number): string {
  // 05:00–11:59 صباح، وما عداه (بما فيه بعد منتصف الليل) مساء.
  if (hour >= 5 && hour < 12) return 'صباح الخير';
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
    <p className="text-sm text-muted-foreground">
      {greetingText}، <span className="font-semibold text-foreground">{firstName}</span> 👋
    </p>
  );
}

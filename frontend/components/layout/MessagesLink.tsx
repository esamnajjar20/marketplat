'use client';

/**
 * رابط الرسائل بجانب جرس الإشعارات على الدسكتوب.
 * BottomNav يغطي الموبايل — هنا يظهر من md فما فوق.
 */
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { useUnreadConversationCount } from '@/hooks/queries/useConversations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { cn } from '@/lib/utils';

export function MessagesLink({ className }: { className?: string }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const { data: unread = 0 } = useUnreadConversationCount();

  if (!isAuthenticated) return null;

  return (
    <Link
      href={ROUTES.messages}
      prefetch={false}
      className={cn(
        'relative hidden h-10 w-10 items-center justify-center rounded-full outline-none ring-offset-background transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:flex',
        className,
      )}
      aria-label={unread > 0 ? `الرسائل — ${unread} غير مقروءة` : 'الرسائل'}
    >
      <MessageCircle className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-medium text-destructive-foreground">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

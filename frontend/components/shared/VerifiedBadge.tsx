import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared verified badge for avatars (UI-a11y + size).
 */
export function VerifiedBadge({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const icon = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <div
      className={cn(
        'absolute bottom-0 end-0 flex items-center justify-center rounded-full border-2 border-background bg-primary shadow-sm',
        box,
        className,
      )}
      title="موثّق"
      aria-label="حساب موثّق"
      role="img"
    >
      <BadgeCheck className={cn(icon, 'text-primary-foreground')} aria-hidden />
    </div>
  );
}

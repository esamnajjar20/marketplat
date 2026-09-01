'use client';

/**
 * UserAvatar — عرض موحّد لصورة المستخدم في القوائم والهيدر.
 * إن وُجدت avatarUrl تُعرض الصورة؛ وإلا الحرف الأول من الاسم.
 */

import { cn } from '@/lib/utils';
import { getAvatarUrl } from '@/lib/cloudinary';
import { SafeImage } from '@/components/shared/ui/SafeImage';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  alt?: string;
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 40,
  className,
  alt,
}: UserAvatarProps) {
  const src = avatarUrl ? getAvatarUrl(avatarUrl, size * 2) : '';
  const initial = (name?.trim()?.charAt(0) || '?').toUpperCase();

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden={alt ? undefined : true}
    >
      {src ? (
        <SafeImage
          variant="avatar"
          src={src}
          alt={alt ?? name}
          fill
          className="object-cover"
          sizes={`${size}px`}
        />
      ) : (
        <span className="select-none">{initial}</span>
      )}
    </span>
  );
}

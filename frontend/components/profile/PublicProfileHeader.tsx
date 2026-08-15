import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Calendar, FileText } from 'lucide-react';
import { getAvatarUrl }   from '@/lib/cloudinary';
import { formatDate }     from '@/lib/formatters';
import { ReportUserButtonGate } from '@/components/profile/ReportUserButtonGate';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import type { PublicUser } from '@/types/user.types';

interface Props { user: PublicUser; }

/**
 * REDESIGN: matches the same mock StoreHeader.tsx was rebuilt against —
 * centered avatar, name, a stats card, centered bio. A plain user has no
 * cover photo, follow relationship, phone, or "verified" concept the
 * way a store does, so those pieces of the mock are simply omitted here
 * rather than faked; the stats card uses what a profile actually has
 * (ad count / city / member-since) in place of store's
 * (followers/products/city). Same data and same ReportUserButtonGate
 * guard as before — only the layout changed.
 */
export function PublicProfileHeader({ user }: Props) {
  const avatar = getAvatarUrl(user.avatarUrl ?? '', 128);

  return (
    <div className="flex flex-col w-full items-center text-center pt-6">
      <div className="relative w-24 h-24 rounded-full bg-background p-1 shadow-md">
        <div className="relative w-full h-full rounded-full overflow-hidden bg-muted">
          <SafeImage variant="avatar" src={avatar} alt={user.name} fill className="object-cover" sizes="96px" />
        </div>
      </div>

      <h1 className="mt-4 text-xl font-bold text-foreground">{user.name}</h1>

      {/* Stats card */}
      <div className="mt-4 w-full max-w-sm bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex justify-around items-center">
          <div className="flex flex-col items-center">
            <FileText className="h-5 w-5 text-primary mb-1" />
            <span className="text-xl font-semibold text-foreground">{user._count.ads}</span>
            <span className="text-xs text-muted-foreground">إعلان</span>
          </div>
          {user.city && (
            <>
              <div className="w-px h-8 bg-border" />
              <div className="flex flex-col items-center">
                <MapPin className="h-5 w-5 text-primary mb-1" />
                <span className="text-xs text-muted-foreground">{user.city}</span>
              </div>
            </>
          )}
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-center">
            <Calendar className="h-5 w-5 text-primary mb-1" />
            <span className="text-xs text-muted-foreground">عضو منذ {formatDate(user.createdAt)}</span>
          </div>
        </div>
      </div>

      {user.bio && (
        <p className="mt-6 text-sm text-muted-foreground text-center max-w-[280px]">{user.bio}</p>
      )}

      {/* FEAT-REPORT-USER-STORE: PublicProfileHeader itself has no
          'use client' — this is a client component that hides itself
          when viewing your own profile (via useAuthStore), the same
          self-report guard reportsService already enforces server-side. */}
      <div className="mt-3 flex items-center gap-2">
        <MessageUserButtonGate targetUserId={user.id} />
        <ReportUserButtonGate targetUserId={user.id} />
      </div>
    </div>
  );
}

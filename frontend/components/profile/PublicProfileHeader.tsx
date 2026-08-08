import Image from 'next/image';
import { MapPin, Calendar } from 'lucide-react';
import { getAvatarUrl }   from '@/lib/cloudinary';
import { formatDate }     from '@/lib/formatters';
import { ReportUserButtonGate } from '@/components/profile/ReportUserButtonGate';
import type { PublicUser } from '@/types/user.types';

interface Props { user: PublicUser; }

export function PublicProfileHeader({ user }: Props) {
  const avatar = getAvatarUrl(user.avatarUrl ?? '', 96);

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-lg border bg-card">
      <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted shrink-0">
        <Image src={avatar} alt={user.name} fill className="object-cover" sizes="80px" />
      </div>
      <div className="space-y-1 text-center sm:text-start">
        <h1 className="text-xl font-bold">{user.name}</h1>
        {user.city && (
          <p className="flex items-center justify-center sm:justify-start gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />{user.city}
          </p>
        )}
        <p className="flex items-center justify-center sm:justify-start gap-1 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />عضو منذ {formatDate(user.createdAt)}
        </p>
        {user.bio && <p className="text-sm mt-2 max-w-md">{user.bio}</p>}
        <p className="text-sm text-muted-foreground">{user._count.ads} إعلان</p>
        {/* FEAT-REPORT-USER-STORE: PublicProfileHeader itself has no
            'use client' — this is a client component that hides itself
            when viewing your own profile (via useAuthStore), the same
            self-report guard reportsService already enforces server-side. */}
        <ReportUserButtonGate targetUserId={user.id} />
      </div>
    </div>
  );
}

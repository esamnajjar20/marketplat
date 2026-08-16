'use client';

/**
 * UNIFIED-PROFILE: the requested "edit" entry point on /profile/[id] —
 * only ever visible to the profile's own owner, mirroring the exact
 * client-boundary shape MessageUserButtonGate / ReportUserButtonGate
 * already use right next to this (PublicProfileHeader itself has no
 * 'use client', so the "is this me" check needs its own small client
 * component). Links to /settings/profile rather than opening an inline
 * edit form here — that settings page already owns name/city/bio/avatar
 * editing end to end (ProfileSettingsForm.tsx), so this avoids a second,
 * competing edit surface for the same fields.
 */
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { useAuthStore, selectUser } from '@/store/auth.store';

interface Props {
  targetUserId: string;
}

export function EditProfileButtonGate({ targetUserId }: Props) {
  const currentUser = useAuthStore(selectUser);

  if (!currentUser || currentUser.id !== targetUserId) return null;

  return (
    <Link href={ROUTES.settings.profile}>
      <Button variant="outline" size="sm" className="gap-2">
        <Pencil className="h-4 w-4" />
        تعديل الملف الشخصي
      </Button>
    </Link>
  );
}

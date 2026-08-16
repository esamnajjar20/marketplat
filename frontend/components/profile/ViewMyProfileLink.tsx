'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';

/**
 * FIX UX-PROFILE-01: the only way to reach /profile/[id] (the real,
 * working public-profile page) was to already know your own user id
 * and type the URL by hand — every in-app link to that route pointed
 * at someone else's id (report targets, ad sellers). Mirrors
 * MySellerProfileCard's identical "عرض صفحتي العامة كبائع" pattern
 * one level up, for the base user profile.
 */
export function ViewMyProfileLink() {
  const user = useAuthStore(selectUser);
  if (!user) return null;

  return (
    <Button variant="outline" size="sm" asChild className="gap-1.5 shrink-0">
      <Link href={ROUTES.userProfile(user.id)}>
        عرض ملفي كما يظهر للآخرين <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { StoreReviewDialog } from './StoreReviewDialog';
import { useAuthStore, selectIsAuthenticated, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';

interface Props {
  storeId: string;
  storeName: string;
  /** Owning seller's userId — used only to hide the button on one's own store. */
  ownerUserId: string;
}

/** Mirrors ServiceRequestButton's auth-gate + self-store-hide pattern. */
export function StoreReviewButton({ storeId, storeName, ownerUserId }: Props) {
  const [open, setOpen] = useState(false);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore(selectUser);
  const router = useRouter();

  // A store owner can't review their own store — same guard the
  // backend's createReview enforces server-side.
  if (user?.id === ownerUserId) return null;

  function handleOpen() {
    if (!isAuthenticated) {
      router.push(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.storeDetail(storeId))}`);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen} className="gap-1.5">
        <Star className="h-4 w-4" />
        إضافة تقييم
      </Button>
      <StoreReviewDialog
        storeId={storeId}
        storeName={storeName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

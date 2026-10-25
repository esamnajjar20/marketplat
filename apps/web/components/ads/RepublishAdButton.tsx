'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useRepublishAd } from '@/hooks/mutations/useRepublishAd';
import { useState } from 'react';

interface Props {
  adId: string;
  /** يظهر للإعلانات المغلقة التي يمكن إنشاء نسخة جديدة منها. */
  status: 'SOLD' | 'DELETED' | 'EXPIRED' | string;
  className?: string;
}

export function RepublishAdButton({ adId, status, className }: Props) {
  const republish = useRepublishAd();
  const [open, setOpen] = useState(false);

  if (status !== 'SOLD' && status !== 'DELETED' && status !== 'EXPIRED') return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className}
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="h-3.5 w-3.5 ms-1" />
        إعادة نشر
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="إعادة نشر الإعلان؟"
        description="سيتم إنشاء إعلان جديد بنفس المحتوى والصور. الإعلان الحالي يبقى كما هو."
        confirmLabel="إعادة النشر"
        isPending={republish.isPending}
        onConfirm={() => {
          republish.mutate(adId, {
            onSuccess: () => setOpen(false),
          });
        }}
      />
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock3, PencilLine, UploadCloud } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { listAdDrafts, type AdDraft, type OfflineDraftKind } from '@/lib/offlineAdDrafts';
import { resumeHrefForDraft } from '@/lib/offlineDraftResume';
import { useAuthStore } from '@/store/auth.store';

interface Props {
  kind: OfflineDraftKind;
  className?: string;
}

function titleFor(draft: AdDraft): string {
  const title = String(draft.payload.title ?? '').trim();
  return title || (draft.mode === 'edit' ? 'تعديل بدون عنوان' : 'عنصر جديد');
}

function labelFor(kind: OfflineDraftKind): string {
  if (kind === 'product') return 'منتج';
  if (kind === 'service') return 'خدمة';
  if (kind === 'open-request') return 'طلب';
  return 'إعلان';
}

export function PendingOfflinePublishCard({ kind, className }: Props) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [drafts, setDrafts] = useState<AdDraft[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const items = await listAdDrafts(userId);
      if (!alive) return;
      setDrafts(
        items
          .filter((d) => (d.kind ?? 'ad') === kind && d.status === 'pending_sync')
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 3),
      );
    };
    void load();
    const onUpdated = () => void load();
    window.addEventListener('offline-drafts:updated', onUpdated);
    return () => {
      alive = false;
      window.removeEventListener('offline-drafts:updated', onUpdated);
    };
  }, [kind, userId]);

  if (!drafts.length) return null;

  return (
    <section className={className} aria-label={`${labelFor(kind)} قيد النشر`}>
      <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">ما أنشأته أوفلاين</h2>
            <p className="text-xs text-muted-foreground">يظهر هنا فورًا، ويُرفع تلقائيًا عند استقرار الاتصال.</p>
          </div>
          <Badge variant="secondary">قيد النشر</Badge>
        </div>

        <div className="space-y-2">
          {drafts.map((draft) => (
            <div key={draft.id} className="flex items-center gap-3 rounded-xl border bg-background/80 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                {draft.mode === 'edit' ? <PencilLine className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{titleFor(draft)}</p>
                <p className="text-xs text-muted-foreground">
                  {draft.mode === 'edit' ? 'التعديل ظاهر محليًا وسيُرسل لاحقًا' : `${labelFor(kind)} ظاهر محليًا وسيُنشر لاحقًا`}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={resumeHrefForDraft(draft)}>تعديل</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { Star, Trash2, Pin } from 'lucide-react';
import { Button }     from '@/components/shared/ui/Button';
import { Badge }      from '@/components/shared/ui/Badge';
import { Input }      from '@/components/shared/ui/Input';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog }  from '@/components/shared/feedback/ConfirmDialog';
import { useAdminAds }    from '@/hooks/queries/useAdmin';
import { useAdminSetFeatured, useAdminSetPinned, useAdminForceDeleteAd } from '@/hooks/mutations/useAdminMutations';
import { ROUTES, STATUS_LABELS } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';

export function AdminAdsTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  const page   = Number(sp.get('page') ?? 1);
  const q      = sp.get('q') ?? '';
  const status = sp.get('status') ?? '';

  const { data, isLoading, isError, refetch } = useAdminAds({ page, q, status });
  const featureAd = useAdminSetFeatured();
  const pinAd     = useAdminSetPinned();
  const deleteAd  = useAdminForceDeleteAd();

  // UX-FIX P1-5 / P2-11: featureAd/pinAd are each a single shared mutation
  // instance (see useToggleAdField), so isPending alone can't tell us
  // *which* row is in flight, and previously there was no disabled state
  // at all on these two buttons — a fast repeat click could fire the
  // toggle multiple times before the optimistic update even settled.
  // Track (adId, field) pairs currently in flight instead.
  const [pendingToggle, setPendingToggle] = useState<{ adId: string; field: 'featured' | 'pinned' } | null>(null);

  // Tracks which ad the delete-confirmation dialog applies to (null = closed).
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  function toggleFeatured(adId: string, next: boolean) {
    setPendingToggle({ adId, field: 'featured' });
    featureAd.mutate({ adId, value: next }, { onSettled: () => setPendingToggle(null) });
  }

  function togglePinned(adId: string, next: boolean) {
    setPendingToggle({ adId, field: 'pinned' });
    pinAd.mutate({ adId, value: next }, { onSettled: () => setPendingToggle(null) });
  }

  function search(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set('q', value); else params.delete('q');
    params.delete('page');
    router.push(`/admin/ads?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="بحث بالعنوان…" defaultValue={q}
          onBlur={(e) => search(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search((e.target as HTMLInputElement).value); }}
          className="max-w-xs" />
        <select value={status}
          onChange={(e) => {
            const params = new URLSearchParams(sp.toString());
            if (e.target.value) params.set('status', e.target.value); else params.delete('status');
            params.delete('page');
            router.push(`/admin/ads?${params.toString()}`);
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {isError ? (
        // UX-FIX P1-4: previously a failed fetch fell straight through to
        // the `items.length === 0` empty-state row below, indistinguishable
        // from "no ads exist" — an admin had no way to tell a real fetch
        // failure apart from a genuinely empty result set.
        <div className="rounded-lg border p-12 text-center text-muted-foreground space-y-3">
          <p>تعذّر تحميل الإعلانات. يرجى المحاولة مرة أخرى.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start p-3 font-medium">الإعلان</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">البائع</th>
                <th className="text-start p-3 font-medium">السعر</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">الحالة</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">التاريخ</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((ad) => {
                const thumb = ad.images[0] ? getThumbnailUrl(ad.images[0], 80, 60) : PLACEHOLDER_SVG;
                return (
                  <tr key={ad.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="relative w-12 h-9 rounded overflow-hidden bg-muted shrink-0">
                          <Image src={thumb} alt={ad.title} fill className="object-cover" sizes="48px" />
                        </div>
                        <div className="min-w-0">
                          <Link href={ROUTES.adDetail(ad.id)} className="font-medium hover:underline line-clamp-1"
                            target="_blank">{ad.title}</Link>
                          {ad.isFeatured && <Badge variant="outline" className="text-xs border-warning text-warning">مميز</Badge>}
                          {ad.isPinned   && <Badge variant="outline" className="text-xs me-1">مثبّت</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{ad.user?.name ?? '—'}</td>
                    <td className="p-3 font-semibold">{formatPrice(ad.price)}</td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge variant={ad.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                        {STATUS_LABELS[ad.status] ?? ad.status}
                      </Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatRelativeTime(ad.createdAt)}</td>
                    <td className="p-3">
                      {/* FIX A11Y-01: title alone isn't reliably
                          announced by screen readers / has no keyboard
                          equivalent — aria-label is the real accessible
                          name here, and reflects the actual action
                          (toggle on/off) rather than a static label. */}
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          title="تمييز"
                          aria-label={ad.isFeatured ? `إلغاء تمييز ${ad.title}` : `تمييز ${ad.title}`}
                          disabled={pendingToggle?.adId === ad.id && pendingToggle.field === 'featured'}
                          onClick={() => toggleFeatured(ad.id, !ad.isFeatured)}>
                          <Star className={`h-3.5 w-3.5 ${ad.isFeatured ? 'fill-warning text-warning' : ''}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          title="تثبيت"
                          aria-label={ad.isPinned ? `إلغاء تثبيت ${ad.title}` : `تثبيت ${ad.title}`}
                          disabled={pendingToggle?.adId === ad.id && pendingToggle.field === 'pinned'}
                          onClick={() => togglePinned(ad.id, !ad.isPinned)}>
                          <Pin className={`h-3.5 w-3.5 ${ad.isPinned ? 'text-primary' : ''}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          title="حذف"
                          aria-label={`حذف ${ad.title}`}
                          onClick={() => setDeleteTargetId(ad.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">لا توجد إعلانات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl="/admin/ads" searchParams={Object.fromEntries(sp.entries())} />
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="حذف هذا الإعلان نهائياً؟"
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف"
        destructive
        isPending={deleteAd.isPending}
        onConfirm={() => {
          if (!deleteTargetId) return;
          deleteAd.mutate(deleteTargetId, { onSuccess: () => setDeleteTargetId(null) });
        }}
      />
    </div>
  );
}

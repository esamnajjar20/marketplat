'use client';

import Link from 'next/link';
import { Bell, Image as ImageIcon } from 'lucide-react';
import { useFollowingFeed } from '@/hooks/queries/useFollows';
import { useAuthStore } from '@/store/auth.store';
import { SafeImage } from '@/components/shared/ui/SafeImage';

export function FollowingFeedSection() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { data, isLoading } = useFollowingFeed({ limit: 12 });
  if (!isAuthenticated) return null;
  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="font-bold">أتابع</h2><p className="text-xs text-muted-foreground">أحدث المحتوى من الأشخاص والمتاجر والفئات التي تتابعها</p></div>
        <Bell className="h-5 w-5 text-muted-foreground" />
      </div>
      {isLoading ? <div className="py-6 text-center text-sm text-muted-foreground">جارٍ تحميل المحتوى…</div> : !data?.items.length ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ابدأ بمتابعة أشخاص أو متاجر أو فئات ليظهر محتواهم هنا.</div> : <div className="grid gap-3 sm:grid-cols-2">{data.items.map((item) => {
        const href = item.type === 'AD' ? `/ads/${item.id}` : item.type === 'PRODUCT' ? `/products/${item.id}` : `/service-listings/${item.id}`;
        return <Link key={`${item.type}-${item.id}`} href={href} className="flex gap-3 rounded-xl border border-border p-3 transition hover:bg-muted">
          {item.images?.[0] ? <SafeImage src={item.images[0]} alt="" width={72} height={72} className="h-18 w-18 rounded-lg object-cover" /> : <div className="flex h-18 w-18 items-center justify-center rounded-lg bg-muted"><ImageIcon className="h-5 w-5" /></div>}
          <div className="min-w-0"><div className="text-xs text-muted-foreground">{item.type === 'AD' ? 'إعلان' : item.type === 'PRODUCT' ? 'منتج' : 'خدمة'}</div><h3 className="truncate font-medium">{item.title}</h3>{item.price != null && <p className="mt-1 text-sm font-semibold">{String(item.price)}</p>}</div>
        </Link>;
      })}</div>}
    </section>
  );
}

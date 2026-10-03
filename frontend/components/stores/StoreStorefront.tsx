'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Package, Tag, Layers, Star, Megaphone, Info, MapPin, Phone } from 'lucide-react';
import { StoreAds } from '@/components/stores/StoreAds';
import { StoreProducts } from '@/components/stores/StoreProducts';
import { StoreCollections } from '@/components/stores/StoreCollections';
import { StoreReviewsList } from '@/components/stores/StoreReviewsList';
import { StoreReviewButton } from '@/components/stores/StoreReviewButton';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { formatPhone } from '@/lib/formatters';
import { getStoreTypePresentation, type StoreWithSellerAndCounts, type StoreWeekday } from '@/types/store.types';

type Tab = 'products' | 'offers' | 'collections' | 'ads' | 'reviews' | 'about';

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: 'products', label: 'المنتجات', icon: Package },
  { id: 'offers', label: 'العروض', icon: Tag },
  { id: 'collections', label: 'المجموعات', icon: Layers },
  { id: 'ads', label: 'الإعلانات', icon: Megaphone },
  { id: 'reviews', label: 'التقييمات', icon: Star },
  { id: 'about', label: 'عن المتجر', icon: Info },
];

const STORE_HOURS_DAYS: { key: StoreWeekday; label: string }[] = [
  { key: 'sat', label: 'السبت' },
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
];

interface Props {
  storeId: string;
  storeName: string;
  ownerUserId: string;
  /** PHASE1-STOREFRONT: full store payload for the "عن المتجر" tab. */
  store?: StoreWithSellerAndCounts;
}

export function StoreStorefront({ storeId, storeName, ownerUserId, store }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get('tab') as Tab | null) ?? 'products';
  const presentation = getStoreTypePresentation(store?.storeType);
  const active: Tab = TABS.some((t) => t.id === tab) ? tab : 'products';
  const tabs = TABS.map((item) => ({ ...item, label: presentation.page[item.id === 'products' ? 'products' : item.id === 'offers' ? 'offers' : item.id === 'collections' ? 'collections' : item.id === 'ads' ? 'ads' : item.id === 'reviews' ? 'reviews' : 'about'] }));

  function setTab(next: Tab) {
    const params = new URLSearchParams(sp.toString());
    if (next === 'products') params.delete('tab');
    else params.set('tab', next);
    params.delete('productsPage');
    router.push(`${ROUTES.storeDetail(storeId)}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div
        className="flex gap-1 overflow-x-auto border-b pb-0 scrollbar-thin"
        role="tablist"
        aria-label="أقسام المتجر"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              active === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {active === 'products' && (
        <section className="space-y-3" role="tabpanel">
          <StoreProducts storeId={storeId} storeName={storeName} />
        </section>
      )}

      {active === 'ads' && (
        <section className="space-y-3" role="tabpanel">
          <StoreAds storeId={storeId} storeName={storeName} />
        </section>
      )}

      {active === 'offers' && (
        <section className="space-y-3" role="tabpanel">
          <p className="text-sm text-muted-foreground">{presentation.page.offers}</p>
          <StoreProducts storeId={storeId} storeName={storeName} offersOnly />
        </section>
      )}

      {active === 'collections' && (
        <section className="space-y-3" role="tabpanel">
          <StoreCollections storeId={storeId} />
        </section>
      )}

      {active === 'reviews' && (
        <section className="space-y-3" role="tabpanel">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-lg font-bold">
              <Star className="h-4 w-4 text-muted-foreground" />
              {presentation.page.reviews}
            </h2>
            <StoreReviewButton storeId={storeId} storeName={storeName} ownerUserId={ownerUserId} />
          </div>
          <StoreReviewsList storeId={storeId} />
        </section>
      )}

      {active === 'about' && store && (
        <section className="space-y-5" role="tabpanel">
          <StoreAboutPanel store={store} />
        </section>
      )}

      {active === 'about' && !store && (
        <section className="space-y-3" role="tabpanel">
          <p className="text-sm text-muted-foreground">لا تتوفر تفاصيل إضافية لهذا المتجر.</p>
        </section>
      )}
    </div>
  );
}

function StoreAboutPanel({ store }: { store: StoreWithSellerAndCounts }) {
  // FIX STOREFRONT-ABOUT-SCOPE: presentation is defined in the parent
  // StoreStorefront; this nested component needs its own lookup (or a
  // prop). Using the helper keeps it a single source of truth.
  const presentation = getStoreTypePresentation(store.storeType);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {store.description && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-foreground">{presentation.page.about}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {store.description}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-foreground">معلومات التواصل والموقع</h3>
        <ul className="space-y-2.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <a href={`tel:${store.phone}`} className="hover:text-primary hover:underline">
              {formatPhone(store.phone)}
            </a>
          </li>
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              {store.city}
              {store.address ? ` — ${store.address}` : ''}
            </span>
          </li>
          {store.latitude && store.longitude && (
            <li>
              <a
                href={`https://www.openstreetmap.org/?mlat=${store.latitude}&mlon=${store.longitude}#map=16/${store.latitude}/${store.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <MapPin className="h-3.5 w-3.5" />
                عرض الموقع على الخريطة
              </a>
            </li>
          )}
        </ul>
      </div>

      {store.workingHours && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">ساعات العمل</h3>
            {store.isOpen !== null && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`h-2 w-2 rounded-full ${store.isOpen ? 'bg-success' : 'bg-muted-foreground/60'}`}
                />
                {store.isOpen ? 'مفتوح الآن' : 'مغلق الآن'}
              </span>
            )}
          </div>
          <ul className="space-y-1.5 text-sm">
            {STORE_HOURS_DAYS.map(({ key, label }) => {
              const schedule = store.workingHours![key];
              return (
                <li
                  key={key}
                  className="flex items-center justify-between text-muted-foreground"
                >
                  <span>{label}</span>
                  <span className="tabular-nums">
                    {schedule ? `${schedule.open} – ${schedule.close}` : 'مغلق'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!store.description && !store.workingHours && (
        <p className="text-center text-sm text-muted-foreground py-6">
          لم يُضف صاحب المتجر تفاصيل إضافية بعد.
        </p>
      )}
    </div>
  );
}

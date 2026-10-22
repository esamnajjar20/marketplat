'use client';

import dynamic from 'next/dynamic';
import { useRef, type KeyboardEvent } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';
import { Star, Info, MapPin, Phone, Clock } from 'lucide-react';
import { StoreProducts } from '@/components/stores/StoreProducts';
import { StoreReviewButton } from '@/components/stores/StoreReviewButton';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { formatPhone } from '@/lib/formatters';
import { getStoreTypePresentation, type StoreWithSellerAndCounts, type StoreWeekday } from '@/types/store.types';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

const StoreAds = dynamic(
  () => import('@/components/stores/StoreAds').then((m) => m.StoreAds),
  { loading: () => <SuspenseFallback /> },
);
const StoreCollections = dynamic(
  () => import('@/components/stores/StoreCollections').then((m) => m.StoreCollections),
  { loading: () => <SuspenseFallback /> },
);
const StoreReviewsList = dynamic(
  () => import('@/components/stores/StoreReviewsList').then((m) => m.StoreReviewsList),
  { loading: () => <SuspenseFallback /> },
);

type Tab = 'products' | 'offers' | 'collections' | 'ads' | 'reviews' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'products', label: 'المنتجات' },
  { id: 'offers', label: 'العروض' },
  { id: 'collections', label: 'المجموعات' },
  { id: 'ads', label: 'الإعلانات' },
  { id: 'reviews', label: 'التقييمات' },
  { id: 'about', label: 'عن المتجر' },
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
  /** full store payload for the "عن المتجر" tab. */
  store?: StoreWithSellerAndCounts;
}

export function StoreStorefront({ storeId, storeName, ownerUserId, store }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get('tab') as Tab | null) ?? 'products';
  const presentation = getStoreTypePresentation(store?.storeType);
  const active: Tab = TABS.some((t) => t.id === tab) ? tab : 'products';
  const tabs = TABS.map((item) => ({ ...item, label: presentation.page[item.id === 'products' ? 'products' : item.id === 'offers' ? 'offers' : item.id === 'collections' ? 'collections' : item.id === 'ads' ? 'ads' : item.id === 'reviews' ? 'reviews' : 'about'] }));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);


  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowLeft') next = index + 1;
    else if (event.key === 'ArrowRight') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const bounded = (next + tabs.length) % tabs.length;
    const nextTab = tabs[bounded];
    if (!nextTab) return;
    setTab(nextTab.id);
    tabRefs.current[bounded]?.focus();
  }

  function setTab(next: Tab) {
    const params = new URLSearchParams(sp.toString());
    if (next === 'products') params.delete('tab');
    else params.set('tab', next);
    params.delete('productsPage');
    router.push(`${ROUTES.storeDetail(storeId)}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-5 lg:space-y-6">
      <div
        className="sticky top-[var(--protected-header-offset,4rem)] z-20 -mx-2 flex gap-1.5 overflow-x-auto overscroll-x-contain border-b border-border bg-background/95 px-4 scrollbar-thin backdrop-blur supports-[backdrop-filter]:bg-background/85"
        role="tablist"
        aria-label="أقسام المتجر"
      >
        {tabs.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`store-tab-${id}`}
            aria-selected={active === id}
            aria-controls={`store-panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            ref={(el) => { tabRefs.current[index] = el; }}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            onClick={() => setTab(id)}
            className={cn(
              'h-12 shrink-0 whitespace-nowrap border-b-[3px] px-3 text-sm transition-colors',
              active === id
                ? 'border-primary font-extrabold text-primary-strong'
                : 'border-transparent font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {active === 'products' && (
        <section className="rounded-2xl border border-border/60 bg-background/60 p-1" role="tabpanel"
          id="store-panel-products"
          aria-labelledby="store-tab-products">
          <StoreProducts storeId={storeId} storeName={storeName} />
        </section>
      )}

      {active === 'ads' && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-ads"
          aria-labelledby="store-tab-ads">
          <StoreAds storeId={storeId} storeName={storeName} />
        </section>
      )}

      {active === 'offers' && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-offers"
          aria-labelledby="store-tab-offers">
          <p className="text-sm text-muted-foreground">{presentation.page.offers}</p>
          <StoreProducts storeId={storeId} storeName={storeName} offersOnly />
        </section>
      )}

      {active === 'collections' && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-collections"
          aria-labelledby="store-tab-collections">
          <StoreCollections storeId={storeId} />
        </section>
      )}

      {active === 'reviews' && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-reviews"
          aria-labelledby="store-tab-reviews">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-lg font-bold">
              <Star className="h-4 w-4 text-muted-foreground" />
              {presentation.page.reviews}
            </h2>
            <StoreReviewButton storeId={storeId} storeName={storeName} ownerUserId={ownerUserId} />
          </div>
          <StoreReviewsList
          storeId={storeId}
          averageRating={store?.sellerProfile?.averageRating}
          totalRatings={store?.sellerProfile?.totalRatings}
        />
        </section>
      )}

      {active === 'about' && store && (
        <section className="space-y-5 lg:space-y-6" role="tabpanel"
          id="store-panel-about"
          aria-labelledby="store-tab-about">
          <StoreAboutPanel store={store} />
        </section>
      )}

      {active === 'about' && !store && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-about"
          aria-labelledby="store-tab-about">
          <p className="text-sm text-muted-foreground">لا تتوفر تفاصيل إضافية لهذا المتجر.</p>
        </section>
      )}
    </div>
  );
}

function StoreAboutPanel({ store }: { store: StoreWithSellerAndCounts }) {
  const presentation = getStoreTypePresentation(store.storeType);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3">
      {store.description && (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" aria-hidden />
            <h3 className="text-sm font-extrabold">نبذة عن المتجر</h3>
          </div>
          <p className="text-sm leading-7 text-muted-foreground whitespace-pre-wrap">{store.description}</p>
        </section>
      )}

      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-extrabold">الموقع والتواصل</h3>
        </div>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <a href={`tel:${store.phone}`} className="font-medium text-foreground hover:text-primary hover:underline">{formatPhone(store.phone)}</a>
          </li>
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>{store.city}{store.address ? ` — ${store.address}` : ''}</span>
          </li>
          {store.latitude && store.longitude && (
            <li>
              <a href={`https://www.openstreetmap.org/?mlat=${store.latitude}&mlon=${store.longitude}#map=16/${store.latitude}/${store.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-primary hover:bg-muted/50">
                <MapPin className="h-3.5 w-3.5" />
                {presentation.page.location}
              </a>
            </li>
          )}
        </ul>
      </section>

      {store.workingHours && (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" aria-hidden />
            <h3 className="text-sm font-bold">ساعات العمل</h3>
            {store.isOpen !== null && (
              <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs">
                <span className={`h-2 w-2 rounded-full ${store.isOpen ? 'bg-success' : 'bg-muted-foreground/60'}`} />
                {store.isOpen ? 'مفتوح الآن' : 'مغلق الآن'}
              </span>
            )}
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {STORE_HOURS_DAYS.map(({ key, label }) => {
              const schedule = store.workingHours![key];
              return (
                <li key={key} className="flex items-center justify-between rounded-xl bg-muted/35 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{schedule ? `${schedule.open} – ${schedule.close}` : 'مغلق'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!store.description && !store.workingHours && !store.address && (
        <p className="py-10 text-center text-sm text-muted-foreground lg:col-span-2">لا توجد تفاصيل إضافية لهذا المتجر بعد.</p>
      )}
    </div>
  );
}

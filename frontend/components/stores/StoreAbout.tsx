'use client';

import { Info, MapPin, Phone, Clock } from 'lucide-react';
import { formatPhone } from '@/lib/formatters';
import { getStoreTypePresentation, type StoreWithSellerAndCounts, type StoreWeekday } from '@/types/store.types';

const STORE_HOURS_DAYS: { key: StoreWeekday; label: string }[] = [
  { key: 'sat', label: 'السبت' },
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
];

interface StoreAboutProps {
  store?: StoreWithSellerAndCounts;
  presentation: ReturnType<typeof getStoreTypePresentation>;
}

export function StoreAbout({ store, presentation }: StoreAboutProps) {
  if (!store) return null;

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
'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { toast } from 'sonner';
import { productsApi } from '@/api/products.api';
import { storesApi } from '@/api/stores.api';
import type { ProductWithStore } from '@/types/product.types';
import type { StoreWithSellerAndCounts, StoreWeekday } from '@/types/store.types';
import { recordCatalogDownload } from '@/lib/downloadStorage';
import { getAvatarUrl, getDetailImageUrl, getThumbnailUrl } from '@/lib/cloudinary';
import { reportClientError } from '@/lib/errorReporter'; // CATALOG-DOWNLOAD-REPORT-01
import { normalizePaymentMethods } from '@/lib/storePaymentMethods';
import { fetchWithTimeout } from '@/lib/fetchTimeout'; // NETWORK-FETCH-TIMEOUT-01

interface Props {
  storeId: string;
  storeName: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/** نفس ترتيب أيام STORE_HOURS_DAYS في StoreHeader.tsx (السبت أولًا). */
const HOURS_DAYS: { key: StoreWeekday; label: string }[] = [
  { key: 'sat', label: 'السبت' },
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
];

/** تحويل رابط صورة إلى data URL (Base64) لتضمينه داخل الملف — يعمل بدون نت بعد الحفظ. */
async function toDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetchWithTimeout(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** تضمين صورة أساسية واحدة لكل منتج (بحجم مصغّر) بدرجة تزامن محدودة. */
async function embedProductImages(
  products: ProductWithStore[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor = 0;
  const CONCURRENCY = 6;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= products.length) return;
      const p = products[i]; if (!p) continue;
      const src = p.images?.[0];
      if (!src) continue;
      const dataUrl = await toDataUrl(getThumbnailUrl(src, 280, 280));
      if (dataUrl) map.set(p.id, dataUrl);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, products.length) }, () => worker()),
  );
  return map;
}

/**
 * زر تحميل كتالوج المتجر كاملًا كملف HTML مستقل يمكن فتحه ومشاهدته
 * بدون اتصال بالإنترنت: بيانات المتجر، الصور الأساسية (مضمّنة داخل
 * الملف نفسه)، المنتجات بأسعارها وأوصافها، ساعات العمل، ووسائل الدفع.
 */
export function DownloadStoreCatalogButton({
  storeId,
  storeName,
  className,
  variant = 'outline',
  size = 'default',
}: Props) {
  const [loading, setLoading] = useState(false);

  async function fetchAllProducts(): Promise<ProductWithStore[]> {
    const all: ProductWithStore[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      const res = await productsApi.getAll({
        storeId,
        page,
        limit: 100,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      const payload = res.data.data;
      if (!payload) break;
      const { items, meta } = payload;
      all.push(...(items ?? []));
      hasNext = Boolean(meta?.hasNextPage);
      page += 1;
      // safety: avoid infinite loop
      if (page > 200) break;
    }
    return all;
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatPrice(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(n)) return String(value);
    return n.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function buildHtml(
    products: ProductWithStore[],
    ctx: {
      store: StoreWithSellerAndCounts | null;
      logoDataUrl: string | null;
      coverDataUrl: string | null;
      imageMap: Map<string, string>;
    },
  ): string {
    const { store, logoDataUrl, coverDataUrl, imageMap } = ctx;
    const generatedAt = new Date().toLocaleString('ar-EG', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const cards = products
      .map((p) => {
        const price = p.effectivePrice?.price ?? p.price;
        const original = p.effectivePrice?.originalPrice;
        const hasDiscount =
          p.effectivePrice?.discountPrice != null ||
          (original != null && Number(original) > Number(price));
        const availabilityLabel =
          p.availability === 'IN_STOCK'
            ? 'متوفر'
            : p.availability === 'LIMITED'
              ? 'كمية محدودة'
              : 'غير متوفر';
        const embedded = imageMap.get(p.id);
        const img = embedded
          ? `<img src="${embedded}" alt="${escapeHtml(p.name)}" loading="lazy" />`
          : `<div class="no-img">لا توجد صورة</div>`;

        return `
<article class="card">
  <div class="img-wrap">${img}</div>
  <div class="body">
    <h2>${escapeHtml(p.name)}</h2>
    <p class="desc">${escapeHtml(p.description || '')}</p>
    <div class="meta">
      <span class="price ${hasDiscount ? 'discounted' : ''}">
        ${formatPrice(price)} ج.م
        ${hasDiscount && original != null ? `<s>${formatPrice(original)}</s>` : ''}
      </span>
      <span class="stock">${availabilityLabel}</span>
    </div>
  </div>
</article>`;
      })
      .join('\n');

    // بيانات المتجر: العنوان/المدينة/الهاتف/الوصف
    const infoRows: string[] = [];
    if (store?.city) {
      infoRows.push(
        `<div class="info-row"><span class="info-label">المدينة</span><span>${escapeHtml(store.city)}</span></div>`,
      );
    }
    if (store?.address) {
      infoRows.push(
        `<div class="info-row"><span class="info-label">العنوان</span><span>${escapeHtml(store.address)}</span></div>`,
      );
    }
    if (store?.phone) {
      infoRows.push(
        `<div class="info-row"><span class="info-label">الهاتف</span><span dir="ltr">${escapeHtml(store.phone)}</span></div>`,
      );
    }
    const storeInfoSection = store
      ? `
<section class="store-card">
  <div class="store-card-top">
    ${logoDataUrl ? `<img class="store-logo" src="${logoDataUrl}" alt="${escapeHtml(storeName)}" />` : ''}
    <div class="store-card-meta">
      <h2>${escapeHtml(store.name)}</h2>
      ${infoRows.join('\n')}
    </div>
  </div>
  ${store.description ? `<p class="store-desc">${escapeHtml(store.description)}</p>` : ''}
</section>`
      : '';

    // ساعات العمل
    const workingHours = store?.workingHours;
    const hoursRows = workingHours
      ? HOURS_DAYS.map(({ key, label }) => {
          const schedule = workingHours[key];
          return `<tr><td>${label}</td><td>${schedule ? `${escapeHtml(schedule.open)} - ${escapeHtml(schedule.close)}` : 'مغلق'}</td></tr>`;
        }).join('')
      : '';
    const hoursSection = hoursRows
      ? `
<section class="hours-card">
  <h3>ساعات العمل</h3>
  <table class="hours-table">${hoursRows}</table>
</section>`
      : '';

    // وسائل الدفع
    const paymentMethods = normalizePaymentMethods(store?.sellerProfile?.paymentMethods);
    const paymentItems = paymentMethods
      .map(
        (m) => `
<li class="pm-item">
  <span class="pm-label">${escapeHtml(m.label)}</span>
  <span class="pm-num" dir="ltr">${escapeHtml(m.accountNumber)}</span>
  <span class="pm-name">${escapeHtml(m.accountName)}</span>
</li>`,
      )
      .join('');
    const paymentSection = paymentItems
      ? `
<section class="payment-card">
  <h3>وسائل الدفع</h3>
  <ul class="pm-list">${paymentItems}</ul>
</section>`
      : '';

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>كتالوج ${escapeHtml(storeName)}</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --primary: #0ea5e9;
      --border: #e2e8f0;
      --success: #16a34a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    header {
      background: linear-gradient(135deg, #0ea5e9, #0284c7);
      color: #fff;
      padding: 1.5rem 1rem 2rem;
      text-align: center;
    }
    header h1 { margin: 0 0 0.35rem; font-size: 1.5rem; }
    header p { margin: 0; opacity: 0.9; font-size: 0.9rem; }
    .note {
      max-width: 960px;
      margin: 1rem auto;
      padding: 0.75rem 1rem;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 0.75rem;
      color: #9a3412;
      font-size: 0.85rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
      max-width: 1100px;
      margin: 0 auto 2rem;
      padding: 0 1rem;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 3px rgb(0 0 0 / 6%);
    }
    .img-wrap {
      aspect-ratio: 1;
      background: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .no-img { color: var(--muted); font-size: 0.85rem; }
    .body { padding: 0.85rem 1rem 1rem; flex: 1; display: flex; flex-direction: column; gap: 0.4rem; }
    .body h2 { margin: 0; font-size: 1rem; line-height: 1.35; }
    .desc {
      margin: 0;
      font-size: 0.8rem;
      color: var(--muted);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      flex: 1;
    }
    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.35rem;
    }
    .price { font-weight: 700; color: var(--primary); font-size: 1rem; }
    .price.discounted { color: #dc2626; }
    .price s { color: var(--muted); font-weight: 400; font-size: 0.8rem; margin-right: 0.35rem; }
    .stock { font-size: 0.75rem; color: var(--success); }
    .cover-wrap { max-width: 1100px; margin: 0 auto; padding: 0 1rem; }
    .cover-wrap img {
      width: 100%;
      max-height: 260px;
      object-fit: cover;
      border-radius: 0 0 1rem 1rem;
      display: block;
    }
    .store-card, .hours-card, .payment-card {
      max-width: 960px;
      margin: 1rem auto;
      padding: 1rem 1.25rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
    }
    .store-card-top { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .store-logo {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid var(--border);
      flex-shrink: 0;
    }
    .store-card-meta h2 { margin: 0 0 0.35rem; font-size: 1.1rem; }
    .info-row { display: flex; gap: 0.4rem; font-size: 0.85rem; color: var(--muted); }
    .info-row .info-label { color: var(--text); font-weight: 600; }
    .store-desc { margin: 0.85rem 0 0; font-size: 0.85rem; color: var(--muted); line-height: 1.6; }
    .hours-card h3, .payment-card h3 { margin: 0 0 0.75rem; font-size: 1rem; }
    .hours-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .hours-table td { padding: 0.35rem 0.25rem; border-bottom: 1px solid var(--border); }
    .hours-table td:last-child { text-align: left; color: var(--muted); }
    .pm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .pm-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.6rem;
      font-size: 0.85rem;
    }
    .pm-label { font-weight: 700; color: var(--primary); }
    .pm-num { font-weight: 600; }
    .pm-name { color: var(--muted); font-size: 0.8rem; }
    footer {
      text-align: center;
      padding: 1.5rem 1rem;
      color: var(--muted);
      font-size: 0.8rem;
      border-top: 1px solid var(--border);
    }
    @media print {
      header { background: #0284c7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .note { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(storeName)}</h1>
    <p>كتالوج كامل — ${products.length} منتج · آخر تحديث ${escapeHtml(generatedAt)}</p>
  </header>
  ${coverDataUrl ? `<div class="cover-wrap"><img src="${coverDataUrl}" alt="" /></div>` : ''}
  <p class="note">
    هذا الملف محفوظ بالكامل على جهازك — بيانات المتجر، الصور الأساسية، المنتجات
    وأسعارها وأوصافها، ساعات العمل، ووسائل الدفع، كلها متاحة للمشاهدة بدون إنترنت.
  </p>
  ${storeInfoSection}
  ${hoursSection}
  ${paymentSection}
  <div class="grid">
    ${cards || '<p style="grid-column:1/-1;text-align:center;color:#64748b">لا توجد منتجات في هذا المتجر.</p>'}
  </div>
  <footer>
    ملف كتالوج مستقل — تم إنشاؤه من منصة MarketPlat لعرضه دون اتصال
  </footer>
</body>
</html>`;
  }

  async function handleDownload() {
    if (loading) return;
    setLoading(true);
    try {
      const [products, storeRes] = await Promise.all([
        fetchAllProducts(),
        storesApi.getById(storeId).catch(() => null),
      ]);
      const store = storeRes?.data.data ?? null;

      const [logoDataUrl, coverDataUrl, imageMap] = await Promise.all([
        toDataUrl(store?.logoUrl ? getAvatarUrl(store.logoUrl, 160) : null),
        toDataUrl(store?.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 800) : null),
        embedProductImages(products),
      ]);

      const html = buildHtml(products, { store, logoDataUrl, coverDataUrl, imageMap });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = storeName.replace(/[^\u0600-\u06FFa-zA-Z0-9\s_-]/g, '').trim() || 'store';
      a.href = url;
      a.download = `كتالوج-${safeName}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // SW-FIX-CATALOG-REVOKE: Safari iOS can abort the download if
      // the blob URL is revoked in the same tick as click(); defer.
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      await recordCatalogDownload({
        storeId,
        storeName,
        productCount: products.length,
        fileName: `كتالوج-${safeName}.html`,
        html,
      });
    } catch (err) {
      // CATALOG-DOWNLOAD-REPORT-01: report to Sentry so a broken catalog
      // export (image taint, OOM, etc.) is visible beyond the user's toast.
      reportClientError(
        err instanceof Error ? err : new Error(String(err)),
        { tag: 'catalog-download', storeId },
      );
      // SW-FIX-CATALOG-TOAST: alert() blocks the main thread and is
      // inconsistent with the rest of the app's toast-based feedback.
      toast.error('تعذّر تحميل الكتالوج. تأكد من الاتصال وحاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handleDownload}
      disabled={loading}
      aria-busy={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Download className="h-4 w-4" aria-hidden />
      )}
      {loading ? 'جاري الحفظ…' : 'حفظ المتجر (بدون نت)'}
    </Button>
  );
}

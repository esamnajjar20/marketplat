'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { productsApi } from '@/api/products.api';
import type { ProductWithStore } from '@/types/product.types';
import { recordCatalogDownload } from '@/lib/downloadStorage';

interface Props {
  storeId: string;
  storeName: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * زر تحميل كتالوج المتجر كاملًا كملف HTML مستقل يمكن فتحه ومشاهدته
 * بدون اتصال بالإنترنت (النصوص والأسعار والأوصاف؛ الصور تحتاج نت إن وُجدت).
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

  function buildHtml(products: ProductWithStore[]): string {
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
        const img = p.images?.[0]
          ? `<img src="${escapeHtml(p.images[0])}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.style.display='none'" />`
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
    <p>كتالوج المنتجات — ${products.length} منتج · تم التحميل ${escapeHtml(generatedAt)}</p>
  </header>
  <p class="note">
    يمكنك فتح هذا الملف ومشاهدة أسماء المنتجات وأسعارها وأوصافها بدون إنترنت.
    الصور تظهر فقط عند وجود اتصال بالإنترنت (لأنها مخزّنة على السحابة).
  </p>
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
      const products = await fetchAllProducts();
      const html = buildHtml(products);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = storeName.replace(/[^\u0600-\u06FFa-zA-Z0-9\s_-]/g, '').trim() || 'store';
      a.href = url;
      a.download = `كتالوج-${safeName}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      recordCatalogDownload({
        storeId,
        storeName,
        productCount: products.length,
        fileName: `كتالوج-${safeName}.html`,
      });
    } catch (err) {
      console.error('Failed to download store catalog', err);
      alert('تعذّر تحميل الكتالوج. تأكد من الاتصال وحاول مرة أخرى.');
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
      {loading ? 'جاري التحميل…' : 'تحميل المنتجات (بدون نت)'}
    </Button>
  );
}

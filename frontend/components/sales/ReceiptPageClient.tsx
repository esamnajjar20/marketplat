'use client';

import { Button } from '@/components/shared/ui/Button';
import { CloudinaryImage } from '@/components/shared/CloudinaryImage';
import { PaymentHistoryList } from '@/components/sales/payments/PaymentHistoryList';
import { useEffect, useState } from 'react';
import { useSalesReceipt } from '@/hooks/queries/useSales';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { openExternal } from '@/lib/openExternal';
import { formatMoney, formatTimestamp } from '@/lib/formatters';

// PERF-BUNDLE-01: `qrcode` (~20 kB) is only needed for the optional receipt
// QR and was previously a top-level import that pulled the whole library into
// every page transitively importing this component. It is now loaded on
// demand inside the effect below, keeping the sales-receipt route chunk lean.
// ShareAdQrDialog already lazy-loads qrcode; this makes it fully deferred
// across the app so it never enters the shared client graph.
export default function ReceiptPage({ id }: { id: string }) {
  // Use the shared API client so this request targets the configured API
  // origin (marketplat-api), not the frontend origin (which has no matching
  // /api/v1 proxy route and returned 404 in production).
  const q = useSalesReceipt(id);
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!q.data) return;
    // qrcode loaded lazily so it stays out of the route's eager client chunk.
    void import('qrcode')
      .then((mod) => mod.default.toDataURL(
        `Invoice ${q.data.sale.invoiceNumber ?? id} | Total ${Number(q.data.sale.totalPrice).toFixed(2)} ${q.data.sale.currency} | ${new Date(q.data.sale.soldAt).toISOString()}`,
        { width: 180, margin: 1 },
      ))
      .then(setQr)
      .catch(() => setQr(''));
  }, [q.data, id]);

  if (q.isLoading) return <main className="p-6" dir="rtl">جارٍ تحميل الإيصال…</main>;
  if (q.isError || !q.data) return <main className="p-6 text-destructive" dir="rtl">تعذر تحميل الإيصال.</main>;
  const sale = q.data.sale;
  const share = () => {
    const text = `فاتورة ${sale.invoiceNumber ?? ''}\n${sale.entityTitle}\nالإجمالي: ${formatMoney(Number(sale.totalPrice))}\nالمدفوع: ${formatMoney(Number(sale.paidAmount))}\nالمتبقي: ${formatMoney(Number(sale.dueAmount))}`;
    const url = buildWhatsAppUrl({ phone: sale.buyerPhone, text });
    openExternal(url);
  };

  return (
    <main className="desktop-readable mx-auto max-w-3xl p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="print:hidden mb-4 flex flex-wrap gap-2">
        <Button onClick={() => window.print()}>طباعة / حفظ PDF</Button>
        <Button variant="outline" onClick={share}>شارك واتساب</Button>
      </div>
      <article className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6 print:border-0 print:shadow-none">
        <header className="border-b pb-4 text-center">
          <h1 className="text-xl font-extrabold">إيصال بيع</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sale.invoiceNumber ?? 'بدون رقم فاتورة'}</p>
        </header>
        {qr && (
          <div className="my-4 flex justify-center">
            <CloudinaryImage src={qr} alt="QR للفاتورة" width={120} height={120} sizes="120px" />
          </div>
        )}
        <div className="space-y-3 py-5 text-sm">
          <div>
            <span className="text-muted-foreground">الأصناف</span>
            <div className="mt-2 space-y-2">
              {(sale.items?.length ? sale.items : [{ title: sale.entityTitle, quantity: sale.quantity, lineTotal: sale.totalPrice }]).map((item) => (
                <div key={`${item.title}-${item.quantity}`} className="flex justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                  <span>{item.title} × {item.quantity}</span>
                  <strong>{formatMoney(Number(item.lineTotal ?? 0))}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between"><span>المشتري</span><strong>{sale.buyerName}</strong></div>
          <div className="flex justify-between"><span>التاريخ</span><strong>{formatTimestamp(sale.soldAt)}</strong></div>
          <div className="flex justify-between border-t pt-3"><span>الإجمالي</span><strong>{formatMoney(Number(sale.totalPrice))}</strong></div>
          <div className="flex justify-between"><span>المدفوع</span><strong>{formatMoney(Number(sale.paidAmount))}</strong></div>
          <div className="flex justify-between"><span>المتبقي</span><strong>{formatMoney(Number(sale.dueAmount))}</strong></div>
        </div>
        <section className="border-t pt-4">
          <h2 className="mb-3 font-semibold">سجل الدفعات</h2>
          <PaymentHistoryList payments={sale.payments} />
        </section>
        <footer className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">شكرًا لتعاملك معنا</footer>
      </article>
    </main>
  );
}

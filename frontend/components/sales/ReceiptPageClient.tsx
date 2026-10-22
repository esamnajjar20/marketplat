'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PaymentHistoryList } from '@/components/sales/payments/PaymentHistoryList';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api.types';
import type { SaleRecord } from '@/types/sale.types';

interface ReceiptData {
  invoiceNumber: string | null;
  sale: SaleRecord;
}

export default function ReceiptPage({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['sales', 'receipt', id],
    queryFn: async () => {
      const response = await fetch(`/api/v1/sales/${encodeURIComponent(id)}/receipt`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Receipt request failed (${response.status})`);
      const payload = await response.json() as ApiResponse<ReceiptData>;
      if (!payload.data) throw new Error(payload.message || 'Receipt response is empty');
      return payload.data;
    },
  });
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!q.data) return;
    void QRCode.toDataURL(
      `Invoice ${q.data.sale.invoiceNumber ?? id} | Total ${Number(q.data.sale.totalPrice).toFixed(2)} ${q.data.sale.currency} | ${new Date(q.data.sale.soldAt).toISOString()}`,
      { width: 180, margin: 1 },
    ).then(setQr).catch(() => setQr(''));
  }, [q.data, id]);

  if (q.isLoading) return <main className="p-6" dir="rtl">جارٍ تحميل الإيصال…</main>;
  if (q.isError || !q.data) return <main className="p-6 text-destructive" dir="rtl">تعذر تحميل الإيصال.</main>;
  const sale = q.data.sale;
  const share = () => {
    const text = `فاتورة ${sale.invoiceNumber ?? ''}\n${sale.entityTitle}\nالإجمالي: ${Number(sale.totalPrice).toFixed(2)} ₪\nالمدفوع: ${Number(sale.paidAmount).toFixed(2)} ₪\nالمتبقي: ${Number(sale.dueAmount).toFixed(2)} ₪`;
    const url = sale.buyerPhone
      ? `https://wa.me/${sale.buyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
        {qr && <div className="my-4 flex justify-center"><img src={qr} alt="QR للفاتورة" width={120} height={120} /></div>}
        <div className="space-y-3 py-5 text-sm">
          <div>
            <span className="text-muted-foreground">الأصناف</span>
            <div className="mt-2 space-y-2">
              {(sale.items?.length ? sale.items : [{ title: sale.entityTitle, quantity: sale.quantity, lineTotal: sale.totalPrice }]).map((item) => (
                <div key={`${item.title}-${item.quantity}`} className="flex justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                  <span>{item.title} × {item.quantity}</span>
                  <strong>{Number(item.lineTotal ?? 0).toFixed(2)} ₪</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between"><span>المشتري</span><strong>{sale.buyerName}</strong></div>
          <div className="flex justify-between"><span>التاريخ</span><strong>{new Date(sale.soldAt).toLocaleString('ar-PS', { timeZone: 'Asia/Gaza' })}</strong></div>
          <div className="flex justify-between border-t pt-3"><span>الإجمالي</span><strong>{Number(sale.totalPrice).toFixed(2)} ₪</strong></div>
          <div className="flex justify-between"><span>المدفوع</span><strong>{Number(sale.paidAmount).toFixed(2)} ₪</strong></div>
          <div className="flex justify-between"><span>المتبقي</span><strong>{Number(sale.dueAmount).toFixed(2)} ₪</strong></div>
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

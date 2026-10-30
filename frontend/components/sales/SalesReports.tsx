'use client';

import { Download, FileText, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { salesApi } from '@/api/sales.api';
import { Button } from '@/components/ui/button';
import { useSalesReport } from '@/hooks/queries/useSales';
import type { SalePaymentStatus } from '@/types/sale.types';

const money = (value: number) => Number(value || 0).toFixed(2);

export function SalesReports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<SalePaymentStatus | ''>('');
  const [isExporting, setIsExporting] = useState(false);
  const params = useMemo(
    () => ({
      from: from || undefined,
      to: to ? `${to}T23:59:59.999` : undefined,
      status: status || undefined,
      limit: 5000,
    }),
    [from, to, status]
  );
  const { data, isLoading, isError } = useSalesReport(params);

  const download = async () => {
    if (!data || isExporting) return;
    setIsExporting(true);
    try {
      const response = await salesApi.exportReportCsv(params);
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      toast.error('تعذّر تصدير التقرير. حاول مرة أخرى.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="space-y-4" dir="rtl">
      <div className="print:hidden flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="text-sm">
          من
          <input
            type="date"
            value={from}
            onChange={event => setFrom(event.target.value)}
            className="mt-1 block rounded-lg border bg-background px-3 py-2"
          />
        </label>
        <label className="text-sm">
          إلى
          <input
            type="date"
            value={to}
            onChange={event => setTo(event.target.value)}
            className="mt-1 block rounded-lg border bg-background px-3 py-2"
          />
        </label>
        <label className="text-sm">
          الحالة
          <select
            value={status}
            onChange={event => setStatus(event.target.value as SalePaymentStatus | '')}
            className="mt-1 block rounded-lg border bg-background px-3 py-2"
          >
            <option value="">الكل</option>
            <option value="PAID">مدفوع</option>
            <option value="PARTIAL">جزئي</option>
            <option value="UNPAID">غير مدفوع</option>
            <option value="OVERDUE">متأخر</option>
          </select>
        </label>
        <div className="ms-auto flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="ms-2 h-4 w-4" /> PDF / طباعة
          </Button>
          <Button onClick={download} disabled={!data || isExporting}>
            <Download className="ms-2 h-4 w-4" />
            {isExporting ? 'جارٍ التصدير...' : 'CSV'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />
      ) : isError ? (
        <div className="rounded-xl border p-6 text-center text-destructive">
          تعذر تحميل التقرير.
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['الإيراد', data.totals.revenue],
              ['التكلفة', data.totals.cost],
              ['الربح', data.totals.profit],
              ['المدفوع', data.totals.paid],
              ['المتبقي', data.totals.due],
              ['المرتجع', data.totals.refunded],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 font-bold">{money(Number(value))} ₪</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border bg-card">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  {['الفاتورة', 'التاريخ', 'العميل', 'المنتج', 'الإيراد', 'التكلفة', 'الربح', 'المدفوع', 'المتبقي'].map(header => (
                    <th key={header} className="px-3 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-3 font-medium">{row.invoiceNumber ?? '—'}</td>
                    <td className="px-3 py-3">
                      {new Date(row.soldAt).toLocaleDateString('ar-PS', { timeZone: 'Asia/Gaza' })}
                    </td>
                    <td className="px-3 py-3">{row.buyerName}</td>
                    <td className="px-3 py-3">{row.title}</td>
                    <td className="px-3 py-3">{money(row.revenue)}</td>
                    <td className="px-3 py-3">{money(row.cost)}</td>
                    <td className="px-3 py-3 font-semibold">{money(row.profit)}</td>
                    <td className="px-3 py-3">{money(row.paid)}</td>
                    <td className="px-3 py-3">{money(row.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {!isLoading && !data?.rows.length && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <FileText className="mx-auto h-8 w-8" />
          <p className="mt-2">لا توجد عمليات ضمن الفلتر.</p>
        </div>
      )}
    </section>
  );
}

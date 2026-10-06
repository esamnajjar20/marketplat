'use client';

import { useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { useCustomers } from '@/hooks/queries/useCustomers';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';

export function SalesCustomersSection() {
  const [q, setQ] = useState('');
  const query = useCustomers({ page: 1, limit: 30, q: q.trim() || undefined });
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">العملاء</h2>
          <p className="text-sm text-muted-foreground">العملاء المرتبطون بمبيعاتك ومؤشرات الشراء والدين.</p>
        </div>
        <Button variant="outline" onClick={() => void query.refetch()}>
          <RefreshCw className="ms-2 h-4 w-4" />
          تحديث
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="ابحث بالاسم أو رقم الجوال…" aria-label="البحث في العملاء" />
      </div>

      {query.isLoading ? (
        <div className="py-12 text-center text-muted-foreground">جارٍ تحميل العملاء…</div>
      ) : query.isError ? (
        <div className="py-12 text-center text-destructive">تعذر تحميل العملاء.</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <Users className="mx-auto h-9 w-9" />
          <p className="mt-3">لا يوجد عملاء بعد.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((customer) => (
            <article key={customer.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{customer.name}</h3>
                  <p dir="ltr" className="mt-1 text-right text-sm text-muted-foreground">{customer.phone || 'بدون جوال'}</p>
                </div>
                {customer.isVip ? <Badge>VIP</Badge> : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-muted-foreground">المشتريات</span><strong className="block">{Number(customer.totalSpent).toFixed(2)} ₪</strong></div>
                <div><span className="text-muted-foreground">الدين</span><strong className="block">{Number(customer.totalDue).toFixed(2)} ₪</strong></div>
                <div><span className="text-muted-foreground">العمليات</span><strong className="block">{customer.purchaseCount}</strong></div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

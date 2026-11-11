'use client';
import { useState } from 'react';
import { Users, RefreshCw, Plus, Star, Ban } from 'lucide-react';
import { useCustomers, useCustomerOverview } from '@/hooks/queries/useCustomers';
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/mutations/useCustomerMutations';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function CustomersPage() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', note: '' });
  const hasSearch = q.trim().length > 0;
  const overview = useCustomerOverview({ page: 1, limit: 50 });
  const query = useCustomers({ page: 1, limit: 50, q: q.trim() || undefined }, hasSearch);
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const items = hasSearch ? (query.data?.items ?? []) : (overview.data?.customers?.items ?? []);
  const summary = overview.data?.summary;
  const isLoading = hasSearch ? query.isLoading : overview.isLoading;
  const isError = hasSearch ? query.isError : (overview.isError || Boolean(overview.data?.failures.customers));
  const refresh = () => hasSearch ? query.refetch() : overview.refetch();
  const save = async () => {
    if (!form.name.trim()) return;
    await create.mutateAsync({ ...form, phone: form.phone || null, email: form.email || null, address: form.address || null, note: form.note || null });
    setForm({ name: '', phone: '', email: '', address: '', note: '' });
    setOpen(false)
  };
  return <main dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">إدارة العملاء CRM</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">تابع قيمة العملاء، الدين، VIP، العملاء غير النشطين وبيانات التواصل.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void refresh()}><RefreshCw className="ms-2 h-4 w-4" />تحديث</Button>
        <Button onClick={() => setOpen(true)}><Plus className="ms-2 h-4 w-4" />عميل جديد</Button>
      </div>
    </header>
    {overview.data?.failures.summary ? <p className="text-sm text-destructive" role="status">تعذر تحميل إحصائيات العملاء.</p> : null}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {[['العملاء', summary?.totalCustomers ?? 0], ['VIP', summary?.vipCustomers ?? 0], ['مدينون', summary?.debtors ?? 0], ['غير نشطين', summary?.inactiveCustomers ?? 0], ['إجمالي المشتريات', `${(summary?.totalSpent ?? 0).toFixed(2)} ₪`], ['متوسط العميل', `${(summary?.averageCustomerSpend ?? 0).toFixed(2)} ₪`]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-card p-4">
        <span className="text-xs text-muted-foreground">
          {label}
        </span>
        <strong className="mt-1 block text-lg">
          {value}
        </strong>
      </div>)}
    </div>
    <div className="rounded-xl border bg-card p-4">
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالاسم أو رقم الجوال…" />
    </div>
    {isLoading ? <LoadingGate loading={isLoading} label="جارٍ تحميل العملاء" fallback={<div className="grid gap-3 py-2 md:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-12 w-full" />
      </div>)}
    </div>}>
      {null}
    </LoadingGate> : isError ? <div className="py-12 text-center text-destructive">تعذر تحميل العملاء.</div> : items.length === 0 ? <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">لا يوجد عملاء بعد.</div> : <div className="grid gap-3 md:grid-cols-2">
      {items.map(c => <article key={c.id} className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {c.name}
            </h2>
            <p dir="ltr" className="mt-1 text-sm text-muted-foreground text-right">
              {c.phone || 'بدون جوال'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {c.email || 'بدون بريد'}
              {c.lastPurchaseAt ? ` · آخر شراء ${new Date(c.lastPurchaseAt).toLocaleDateString('ar-PS', { timeZone: 'Asia/Gaza' })}` : ''}
            </p>
          </div>
          <div className="flex gap-1">
            {c.isVip ? <Badge><Star className="ms-1 h-3 w-3" />VIP</Badge> : null}
            {c.isBlacklisted ? <Badge variant="destructive"><Ban className="ms-1 h-3 w-3" />محظور</Badge> : null}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">المشتريات</span>
            <strong className="block">{Number(c.totalSpent).toFixed(2)} ₪</strong>
          </div>
          <div>
            <span className="text-muted-foreground">الدين</span>
            <strong className="block">{Number(c.totalDue).toFixed(2)} ₪</strong>
          </div>
          <div>
            <span className="text-muted-foreground">العمليات</span>
            <strong className="block">
              {c.purchaseCount}
            </strong>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void update.mutateAsync({ id: c.id, payload: { isVip: !c.isVip } })}>
            {c.isVip ? 'إزالة VIP' : 'تعيين VIP'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void update.mutateAsync({ id: c.id, payload: { isBlacklisted: !c.isBlacklisted } })}>
            {c.isBlacklisted ? 'إلغاء الحظر' : 'حظر'}
          </Button>
        </div>
      </article>)}
    </div>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>عميل جديد</DialogTitle>
          <DialogDescription>أدخل بيانات العميل. الاسم فقط مطلوب.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="الاسم *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input dir="ltr" placeholder="الجوال" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <Input dir="ltr" placeholder="البريد" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          <Input placeholder="ملاحظة" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button disabled={create.isPending || !form.name.trim()} onClick={() => void save()}>
            {create.isPending ? 'جارٍ الحفظ…' : 'حفظ العميل'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
}

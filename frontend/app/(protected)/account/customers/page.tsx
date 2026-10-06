'use client';
import { useState } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { useCustomers } from '@/hooks/queries/useCustomers';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';

export default function CustomersPage(){
 const [q,setQ]=useState(''); const query=useCustomers({page:1,limit:30,q:q.trim()||undefined});
 const items=query.data?.items ?? [];
 return <main dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
  <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Users className="h-6 w-6 text-primary"/><h1 className="text-2xl font-bold">العملاء</h1></div><p className="mt-1 text-sm text-muted-foreground">سجل العملاء المرتبط بمبيعاتك وديونهم.</p></div><Button variant="outline" onClick={()=>void query.refetch()}><RefreshCw className="ms-2 h-4 w-4"/>تحديث</Button></header>
  <div className="rounded-xl border bg-card p-4"><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث بالاسم أو رقم الجوال…"/></div>
  {query.isLoading?<div className="py-12 text-center text-muted-foreground">جارٍ تحميل العملاء…</div>:query.isError?<div className="py-12 text-center text-destructive">تعذر تحميل العملاء.</div>:items.length===0?<div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">لا يوجد عملاء بعد.</div>:<div className="grid gap-3 md:grid-cols-2">{items.map(c=><article key={c.id} className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{c.name}</h2><p dir="ltr" className="mt-1 text-sm text-muted-foreground text-right">{c.phone||'بدون جوال'}</p></div>{c.isVip?<Badge>VIP</Badge>:null}</div><div className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><span className="text-muted-foreground">المشتريات</span><strong className="block">{Number(c.totalSpent).toFixed(2)} ₪</strong></div><div><span className="text-muted-foreground">الدين</span><strong className="block">{Number(c.totalDue).toFixed(2)} ₪</strong></div><div><span className="text-muted-foreground">العمليات</span><strong className="block">{c.purchaseCount}</strong></div></div></article>)}</div>}
 </main>
}

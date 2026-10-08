'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SaleTransferMethod } from '@/types/sale.types';
export interface PaymentPart { id?: string; amount: string; method: SaleTransferMethod; transferRef?: string; }
const methods: Array<[SaleTransferMethod,string]> = [['CASH','نقدي'],['JAWWAL_PAY','جوال باي'],['BANK_PALESTINE','بنك فلسطين'],['PALPAY','PalPay'],['CARD','بطاقة'],['OTHER','أخرى']];
export function MixedPaymentForm({ payments, onChange, total }: { payments: PaymentPart[]; onChange: (p:PaymentPart[])=>void; total:number }) {
 const sum=payments.reduce((s,p)=>s+Number(p.amount||0),0); const add=()=>onChange([...payments,{id:crypto.randomUUID(),amount:'',method:'CASH'}]);
 return <div className="space-y-3 rounded-xl border p-3"><div className="flex items-center justify-between"><strong className="text-sm">طرق الدفع</strong><Button type="button" size="sm" variant="outline" onClick={add}>+ طريقة</Button></div>{payments.map((p,i)=><div key={p.id ?? `payment-${i}`} className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input inputMode="decimal" value={p.amount} placeholder="المبلغ" onChange={e=>onChange(payments.map((x,j)=>j===i?{...x,amount:e.target.value}:x))}/><select value={p.method} onChange={e=>onChange(payments.map((x,j)=>j===i?{...x,method:e.target.value as SaleTransferMethod}:x))} className="h-10 rounded-md border bg-background px-2 text-sm">{methods.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{payments.length>1?<Button type="button" variant="ghost" onClick={()=>onChange(payments.filter((_,j)=>j!==i))}>حذف</Button>:<span/>}</div>)}<div className="flex justify-between text-xs text-muted-foreground"><span>الموزع: {sum.toFixed(2)} ₪ من {total.toFixed(2)} ₪</span><span className={sum>total?'text-destructive':''}>{sum<=total?'متبقي '+Math.max(total-sum,0).toFixed(2)+' ₪':'تجاوز '+(sum-total).toFixed(2)+' ₪'}</span></div></div>;
}

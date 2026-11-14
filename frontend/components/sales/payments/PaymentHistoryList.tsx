'use client';
import type { SalePayment } from '@/types/sale.types';
import { formatMoney, formatTimestamp } from '@/lib/formatters';
const labels:Record<string,string>={CASH:'نقدي',JAWWAL_PAY:'جوال باي',BANK_PALESTINE:'بنك فلسطين',PALPAY:'PalPay',CARD:'بطاقة',OTHER:'أخرى'};
export function PaymentHistoryList({payments=[]}:{payments?:SalePayment[]}){return <div className="space-y-2">{payments.length?<>{payments.map(p=><div key={p.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{labels[p.method]??p.method}<span className="ms-2 text-xs text-muted-foreground">{formatTimestamp(p.paidAt)}</span></span><strong>{formatMoney(Number(p.amount))}</strong></div>)}</>:<p className="text-sm text-muted-foreground">لا توجد دفعات مسجلة.</p>}</div>}

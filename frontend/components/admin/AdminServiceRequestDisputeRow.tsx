'use client';
import { memo } from 'react';
import { CheckCheck, XCircle } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
type Row={id:string;disputeReason?:string|null;disputedAt?:string|null;customer?:{name:string}|null;listing?:{title:string;provider?:{businessName:string}|null}|null};
type Props={row:Row;onResolve:(id:string,resolution:'COMPLETED'|'CANCELLED')=>void};
export const AdminServiceRequestDisputeRow=memo(function AdminServiceRequestDisputeRow({row,onResolve}:Props){return <tr className="border-t align-top [content-visibility:auto] [contain-intrinsic-size:auto_72px]"><td className="p-3"><div className="font-medium">{row.listing?.title??'—'}</div><Badge variant="destructive" className="mt-1">قيد النزاع</Badge></td><td className="p-3"><div>{row.customer?.name??'—'}</div><div className="text-xs text-muted-foreground">{row.listing?.provider?.businessName??'—'}</div></td><td className="max-w-[320px] p-3 whitespace-pre-wrap text-muted-foreground">{row.disputeReason??'—'}</td><td className="p-3 text-xs text-muted-foreground">{row.disputedAt?new Date(row.disputedAt).toLocaleString('ar'):'—'}</td><td className="p-3"><div className="flex gap-2"><Button size="sm" className="gap-1" onClick={()=>onResolve(row.id,'COMPLETED')}><CheckCheck className="h-3.5 w-3.5"/>إكمال</Button><Button size="sm" variant="destructive" className="gap-1" onClick={()=>onResolve(row.id,'CANCELLED')}><XCircle className="h-3.5 w-3.5"/>إلغاء</Button></div></td></tr>});

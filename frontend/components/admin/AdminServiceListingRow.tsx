'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';
import { memo } from 'react';
import { Pause, Trash2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { formatPrice } from '@/lib/formatters';
type Row=Record<string,unknown>; type Props={row:Row;pendingStatusId?:string;onPause:(id:string)=>void;onDelete:(id:string,title:string)=>void};
export const AdminServiceListingRow=memo(function AdminServiceListingRow({row,pendingStatusId,onPause,onDelete}:Props){const id=String(row.id),title=String(row.title),status=String(row.status),provider=row.provider as {businessName?:string}|undefined;return <tr className="hover:bg-muted/30 [content-visibility:auto] [contain-intrinsic-size:auto_56px]"><td className="p-3 font-medium">{title}</td><td className="p-3 text-muted-foreground">{provider?.businessName??'—'}</td><td className="p-3 tabular-nums">{row.price!=null?formatPrice(Number(row.price)):'—'}</td><td className="p-3"><Badge variant={status==='ACTIVE'?'success':'secondary'}>{status}</Badge></td><td className="p-3 text-xs text-muted-foreground">{<HydrationSafeRelativeTime date={String(row.createdAt)} />}</td><td className="p-3"><div className="flex gap-1">{status==='ACTIVE'&&<Button type="button" size="sm" variant="ghost" aria-label={`إيقاف الخدمة ${title}`} disabled={pendingStatusId===id} onClick={()=>onPause(id)}><Pause className="h-4 w-4"/></Button>}{status!=='DELETED'&&<Button type="button" size="sm" variant="ghost" className="text-destructive" aria-label={`حذف الخدمة ${title}`} onClick={()=>onDelete(id,title)}><Trash2 className="h-4 w-4"/></Button>}</div></td></tr>});

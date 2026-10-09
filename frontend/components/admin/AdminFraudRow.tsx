'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';
import { memo, Fragment } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink, Flag as FlagIcon, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { formatPrice } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { AdSignalsPanel } from './AdSignalsPanel';

type Ad={id:string;title:string;price:number|string|null;riskScore:number;createdAt:string;user?:{name?:string}|null};
type Props={ad:Ad;expanded:boolean;onToggleExpanded:(id:string)=>void;onFlag:(id:string)=>void;onClear:(id:string)=>void;clearPending:boolean};
function riskBadgeVariant(score:number): 'destructive'|'outline'|'secondary' { if(score>=70)return'destructive'; if(score>=40)return'secondary'; return'outline'; }
export const AdminFraudRow=memo(function AdminFraudRow({ad,expanded,onToggleExpanded,onFlag,onClear,clearPending}:Props){return <Fragment><tr className="hover:bg-muted/30 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_56px]"><td className="p-3 max-w-xs"><Link prefetch={false} href={ROUTES.adDetail(ad.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-xs"><ExternalLink className="h-3 w-3 shrink-0"/><span className="truncate">{ad.title}</span></Link><span className="text-xs text-muted-foreground">{ad.price == null ? '—' : formatPrice(Number(ad.price))}</span></td><td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{ad.user?.name??'—'}</td><td className="p-3"><Badge variant={riskBadgeVariant(ad.riskScore)} className="text-xs">{ad.riskScore}</Badge></td><td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{<HydrationSafeRelativeTime date={ad.createdAt} />}</td><td className="p-3"><div className="flex gap-1 justify-end"><Button variant="ghost" size="sm" className="h-7" onClick={()=>onToggleExpanded(ad.id)}>{expanded?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>}الإشارات</Button><Button variant="ghost" size="sm" className="h-7" onClick={()=>onFlag(ad.id)}><FlagIcon className="h-3.5 w-3.5 me-1"/>علامة يدوية</Button><Button variant="ghost" size="sm" className="h-7 text-success" disabled={clearPending} onClick={()=>onClear(ad.id)}><ShieldCheck className="h-3.5 w-3.5 me-1"/>إعلان سليم</Button></div></td></tr>{expanded&&<tr className="bg-muted/20"><td colSpan={5} className="p-0"><AdSignalsPanel adId={ad.id}/></td></tr>}</Fragment>});

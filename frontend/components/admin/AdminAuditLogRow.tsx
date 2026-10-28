'use client';
import type { KeyboardEvent } from 'react';
import { memo } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Tooltip } from '@/components/shared/ui/Tooltip';
import { AUDIT_EVENT_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/formatters';
import type { AuditLog } from '@/types/admin.types';

type Props = { log: AuditLog; index: number; onOpen: (log: AuditLog) => void; onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>, log: AuditLog, index: number) => void; setRowRef: (index: number, el: HTMLTableRowElement | null) => void };
export const AdminAuditLogRow = memo(function AdminAuditLogRow({ log, index, onOpen, onKeyDown, setRowRef }: Props) {
 return <tr ref={(el) => setRowRef(index, el)} tabIndex={0} onClick={() => onOpen(log)} onKeyDown={(e) => onKeyDown(e, log, index)} className="cursor-pointer hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [content-visibility:auto] [contain-intrinsic-size:auto_56px]">
  <td className="p-3"><Badge variant="outline" className="text-xs">{AUDIT_EVENT_LABELS[log.event] ?? log.event}</Badge></td>
  <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{log.user?.name ?? log.userId ?? '—'}</td>
  <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDateTime(log.createdAt)}</td>
  <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{log.ip ?? '—'}</td>
  <td className="p-3 hidden xl:table-cell text-muted-foreground text-xs max-w-[220px] truncate">{log.userAgent ? <Tooltip content={log.userAgent} side="top"><span className="cursor-default">{log.userAgent}</span></Tooltip> : '—'}</td>
  <td className="p-3"><Tooltip content="التفاصيل"><Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`عرض تفاصيل الحدث ${AUDIT_EVENT_LABELS[log.event] ?? log.event}`} onClick={(e) => { e.stopPropagation(); onOpen(log); }}><Eye className="h-3.5 w-3.5" /></Button></Tooltip></td>
 </tr>;
});

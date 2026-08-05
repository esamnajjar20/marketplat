'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle, Eye } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Input } from '@/components/shared/ui/Input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/shared/ui/Dialog';
import { useAdminAuditLogs } from '@/hooks/queries/useAdmin';
import { AUDIT_EVENT_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/formatters';
import type { AuditLog, AuditEventType } from '@/types/admin.types';

const AUDIT_EVENT_TYPES = Object.keys(AUDIT_EVENT_LABELS) as AuditEventType[];

export function AdminAuditLogsTable() {
  const sp = useSearchParams();
  const router = useRouter();

  const page = Number(sp.get('page') ?? 1);
  const event = sp.get('event') ?? '';
  const userId = sp.get('userId') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';

  const { data, isLoading, isError, refetch } = useAdminAuditLogs({
    page,
    event: event ? (event as AuditEventType) : undefined,
    userId: userId || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const [detailsLog, setDetailsLog] = useState<AuditLog | null>(null);

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete('page');
    router.push(`/admin/audit-logs?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="بحث بمعرّف المستخدم…"
          defaultValue={userId}
          onBlur={(e) => updateParam('userId', e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') updateParam('userId', (e.target as HTMLInputElement).value); }}
          className="max-w-[220px]"
        />
        {/* FIX UX-02: native <select> → Radix Select, matching the
            styled Input beside it. 'ALL' sentinel stands in for the
            empty/"كل الأحداث" state since Radix disallows value="". */}
        <Select value={event || 'ALL'} onValueChange={(value) => updateParam('event', value === 'ALL' ? '' : value)}>
          <SelectTrigger className="w-auto min-w-[10rem]">
            <SelectValue placeholder="كل الأحداث" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل الأحداث</SelectItem>
            {AUDIT_EVENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{AUDIT_EVENT_LABELS[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label="من تاريخ"
          defaultValue={from}
          onBlur={(e) => updateParam('from', e.target.value)}
          className="max-w-[160px]"
        />
        <Input
          type="date"
          aria-label="إلى تاريخ"
          defaultValue={to}
          onBlur={(e) => updateParam('to', e.target.value)}
          className="max-w-[160px]"
        />
      </div>

      {isError ? (
        <div className="rounded-lg border p-12 text-center text-muted-foreground space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto" />
          <p className="text-destructive">حدث خطأ أثناء تحميل سجل العمليات</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start p-3 font-medium">الحدث</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">المستخدم</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">التاريخ</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">IP</th>
                <th className="text-start p-3 font-medium hidden xl:table-cell">User Agent</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">
                      {AUDIT_EVENT_LABELS[log.event] ?? log.event}
                    </Badge>
                  </td>
                  <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">
                    {log.user?.name ?? log.userId ?? '—'}
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                    {log.ip ?? '—'}
                  </td>
                  <td className="p-3 hidden xl:table-cell text-muted-foreground text-xs max-w-[220px] truncate">
                    {log.userAgent ?? '—'}
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      title="التفاصيل"
                      aria-label={`عرض تفاصيل الحدث ${AUDIT_EVENT_LABELS[log.event] ?? log.event}`}
                      onClick={() => setDetailsLog(log)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">لا توجد سجلات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl="/admin/audit-logs"
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <Dialog open={detailsLog !== null} onOpenChange={(open) => { if (!open) setDetailsLog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              تفاصيل الحدث: {detailsLog ? (AUDIT_EVENT_LABELS[detailsLog.event] ?? detailsLog.event) : ''}
            </DialogTitle>
          </DialogHeader>
          {detailsLog && (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">المستخدم:</span> {detailsLog.user?.name ?? detailsLog.userId ?? '—'}</p>
              <p><span className="text-muted-foreground">التاريخ:</span> {formatDateTime(detailsLog.createdAt)}</p>
              <p><span className="text-muted-foreground">IP:</span> {detailsLog.ip ?? '—'}</p>
              <p><span className="text-muted-foreground">User Agent:</span> {detailsLog.userAgent ?? '—'}</p>
              <div>
                <p className="text-muted-foreground mb-1">التفاصيل:</p>
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                  {detailsLog.details ? JSON.stringify(detailsLog.details, null, 2) : '—'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

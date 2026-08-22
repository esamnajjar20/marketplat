'use client';

import { useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle, Eye } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Input } from '@/components/shared/ui/Input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/shared/ui/Dialog';
import { useAdminAuditLogs } from '@/hooks/queries/useAdmin';
import { AUDIT_EVENT_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/formatters';
import { parseApiError } from '@/lib/errorParser';
import type { AuditLog, AuditEventType } from '@/types/admin.types';

const AUDIT_EVENT_TYPES = Object.keys(AUDIT_EVENT_LABELS) as AuditEventType[];

// FIX P1-6: `details` was dumped as raw JSON.stringify — readable to a
// developer, meaningless to a non-technical admin looking at e.g.
// {"targetUserId": "...", "isActive": false}. This is a best-effort
// humanizer, not a full schema: keys actually seen across
// useAdminMutations.ts's payloads (userId/adId/sellerProfileId/role/
// isActive/verified/suspended/status/isFeatured/isPinned/reason) get a
// real Arabic label; anything else falls back to a spaced-out version
// of the camelCase key so it's at least readable, rather than
// inventing a translation for a field this component has no way to
// know the meaning of.
const DETAIL_KEY_LABELS: Record<string, string> = {
  targetUserId: 'المستخدم المستهدف',
  userId: 'المستخدم',
  adId: 'الإعلان',
  storeId: 'المتجر',
  reportId: 'البلاغ',
  sellerProfileId: 'ملف البائع',
  serviceProviderId: 'مزوّد الخدمة',
  role: 'الدور',
  isActive: 'الحساب مفعّل',
  isFeatured: 'مميز',
  isPinned: 'مثبّت',
  verified: 'موثّق',
  suspended: 'موقوف',
  status: 'الحالة',
  reason: 'السبب',
  recipientCount: 'عدد المستلمين',
};

/** Splits a camelCase key into spaced words as a last-resort fallback label. */
function humanizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AdminAuditLogsTable() {
  const sp = useSearchParams();
  const router = useRouter();

  const page = Number(sp.get('page') ?? 1);
  const event = sp.get('event') ?? '';
  const userId = sp.get('userId') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';

  const { data, isLoading, isError, error, refetch } = useAdminAuditLogs({
    page,
    event: event ? (event as AuditEventType) : undefined,
    userId: userId || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const [detailsLog, setDetailsLog] = useState<AuditLog | null>(null);
  // FIX A11Y-08: see the onOpenAutoFocus usage below.
  const titleRef = useRef<HTMLHeadingElement>(null);

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
        {/* FIX BUG-XX: same uncontrolled-defaultValue gap as
            AdminUsersTable/AdminStoresTable/etc — browser back/forward
            changes userId/from/to via history navigation with no
            remount, leaving these three inputs showing stale text
            while the URL/results are already correct. Not in the
            original audit's file list (admin/audit-logs was explicitly
            marked "not covered"), found on a follow-up sweep of the
            same pattern. key={...} forces a remount on external change. */}
        <Input
          key={userId}
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
          key={from}
          type="date"
          aria-label="من تاريخ"
          defaultValue={from}
          onBlur={(e) => updateParam('from', e.target.value)}
          className="max-w-[160px]"
        />
        <Input
          key={to}
          type="date"
          aria-label="إلى تاريخ"
          defaultValue={to}
          onBlur={(e) => updateParam('to', e.target.value)}
          className="max-w-[160px]"
        />
      </div>

      {isError ? (
        // FIX AUDIT-1: shared ApiError instead of a hand-rolled block —
        // see AdminAdsTable for the full rationale.
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      ) : isLoading ? (
        // FIX AUDIT-1: TableSkeleton instead of a centered LoadingSpinner
        // on refetch — see AdminAdsTable for the full rationale.
        <TableSkeleton columns={6} />
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
                <tr>
                  <td colSpan={6} className="p-0">
                    {/* FIX P2-13: bare <td> text with no CTA — every other
                        empty list in the app (MyAdsList, AdminReportsTable,
                        AdminUsersTable, …) uses the shared EmptyState
                        component; this table was the one holdout. No
                        filters are active by definition here (empty means
                        no audit events exist at all yet), so there's no
                        "reset filters" action to offer — icon + message
                        only, matching EmptyState's own optional action. */}
                    <EmptyState
                      className="py-12"
                      icon={<AlertTriangle className="h-8 w-8" />}
                      title="لا توجد سجلات"
                    />
                  </td>
                </tr>
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
        {/* FIX A11Y-08: without an explicit onOpenAutoFocus, Radix's
            default auto-focus target (the DialogContent wrapper) can
            resolve one tick after the trigger <Button> (the Eye icon
            button above) has already been marked aria-hidden by the
            outside-content inert/aria-hiding Radix applies on open —
            the browser then warns about a focused element living
            inside an aria-hidden subtree. Focusing the title
            explicitly and synchronously (via e.preventDefault() +
            titleRef.focus()) sidesteps that race instead of relying
            on Radix's own default target resolution. tabIndex={-1} so
            the title is programmatically focusable without joining
            the page's Tab order. */}
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            titleRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
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
                {/* FIX P1-6: key-value table (translated where the key
                    is a known one) instead of raw JSON — see
                    DETAIL_KEY_LABELS above. */}
                {detailsLog.details && Object.keys(detailsLog.details).length > 0 ? (
                  <div className="rounded-md border divide-y text-xs">
                    {Object.entries(detailsLog.details).map(([key, value]) => (
                      <div key={key} className="flex items-start justify-between gap-3 p-2">
                        <span className="text-muted-foreground shrink-0">
                          {DETAIL_KEY_LABELS[key] ?? humanizeKey(key)}
                        </span>
                        <span className="text-end break-all">{formatDetailValue(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

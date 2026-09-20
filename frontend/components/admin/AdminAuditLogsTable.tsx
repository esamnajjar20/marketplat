'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle, Eye } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Input } from '@/components/shared/ui/Input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { Pagination } from '@/components/shared/ui/Pagination';
import { Tooltip } from '@/components/shared/ui/Tooltip';
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
  // FIX AUDIT-EVENT-PARAM-01: validate the event param against the known
  // list -- same pattern AdminStoresTable uses for its statusParam (FIX
  // SEC-3.9). `?event=hacked` used to flow through the `as AuditEventType`
  // cast into the API, which rejected it as a 400; the previous `?? ''`
  // also turned "no event filter" into a literal empty string that ended
  // up in the query key. Now an unknown or missing value falls back to
  // undefined, which the hook forwards as "no filter".
  const eventParam = sp.get('event');
  const event: AuditEventType | undefined =
    eventParam && AUDIT_EVENT_TYPES.includes(eventParam as AuditEventType)
      ? (eventParam as AuditEventType)
      : undefined;
  const userId = sp.get('userId') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';

  const { data, isLoading, isError, error, refetch } = useAdminAuditLogs({
    page,
    event,
    userId: userId || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const [detailsLog, setDetailsLog] = useState<AuditLog | null>(null);
  // FIX A11Y-08: see the onOpenAutoFocus usage below.
  const titleRef = useRef<HTMLHeadingElement>(null);

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // DESKTOP-AUDIT-04: rows were only reachable one Tab stop at a time
  // (landing on the Eye button), with no way to move row-to-row without
  // tabbing through every other focusable element on the page around
  // the table. This is the one admin table where a row maps to a single
  // unambiguous action (open details) — the other admin tables (users/
  // stores/ads/sellers) have several independent per-cell actions per
  // row (approve/ban/feature/etc.), so a single "activate this row"
  // gesture doesn't apply there the same way and was left alone rather
  // than forcing a fake primary action onto them.
  //
  // Rows are focusable (tabIndex 0) and clickable, mirroring the Eye
  // button's own action so mouse and keyboard land on the same
  // behavior. ArrowUp/ArrowDown move focus between rows (Home/End jump
  // to the first/last), Enter/Space open the details dialog — the
  // conventional roving-row pattern for a list of otherwise-identical
  // rows, without turning the table into a full ARIA grid (each row
  // still exposes its native `row` semantics for screen readers; this
  // is a keyboard-convenience layer on top, not a role change).
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, log: AuditLog, index: number) {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        setDetailsLog(log);
        break;
      case 'ArrowDown':
        e.preventDefault();
        rowRefs.current[index + 1]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        rowRefs.current[index - 1]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        rowRefs.current[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        rowRefs.current[items.length - 1]?.focus();
        break;
      default:
        break;
    }
  }

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
        <>
        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {items.map((log) => (
            <div key={log.id} className="flex items-start justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-xs">
              <div className="min-w-0 flex-1 space-y-1">
                <Badge variant="outline" className="text-xs">
                  {AUDIT_EVENT_LABELS[log.event] ?? log.event}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {log.user?.name ?? log.userId ?? '—'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateTime(log.createdAt)}
                  {log.ip ? ` · ${log.ip}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label={`عرض تفاصيل الحدث ${AUDIT_EVENT_LABELS[log.event] ?? log.event}`}
                onClick={() => setDetailsLog(log)}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="hidden w-full overflow-x-auto rounded-lg border md:block">
          <table className="w-full min-w-[640px] text-sm [&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted/50 [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-background [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
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
              {items.map((log, index) => (
                <tr
                  key={log.id}
                  ref={(el) => { rowRefs.current[index] = el; }}
                  tabIndex={0}
                  onClick={() => setDetailsLog(log)}
                  onKeyDown={(e) => handleRowKeyDown(e, log, index)}
                  className="cursor-pointer hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
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
                    {/* DESKTOP-AUDIT-01: was truncate with no way to read
                        the full value — a mouse user on this exact
                        breakpoint (xl, where this column is even visible)
                        had no way to see the rest without opening the
                        details dialog. Only wrap in Tooltip when there's
                        something to truncate — an empty '—' never needs one. */}
                    {log.userAgent ? (
                      <Tooltip content={log.userAgent} side="top">
                        <span className="cursor-default">{log.userAgent}</span>
                      </Tooltip>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3">
                    {/* DESKTOP-AUDIT-01: title= gave a native browser
                        tooltip (slow, unstyled, inconsistent across
                        browsers) — swapped for the app's own Tooltip.
                        aria-label stays; it's what's actually announced
                        to screen readers, independent of the visual hint. */}
                    <Tooltip content="التفاصيل">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label={`عرض تفاصيل الحدث ${AUDIT_EVENT_LABELS[log.event] ?? log.event}`}
                        onClick={(e) => { e.stopPropagation(); setDetailsLog(log); }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
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
        </>
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

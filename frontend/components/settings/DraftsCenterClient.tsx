'use client';

/**
 * DRAFTS-CENTER-01: مركز المسودات — /settings/drafts
 * قائمة موحّدة لكل المسودات المحلية (إعلان/منتج/خدمة/طلب)
 * مع تبويبات وإجراءات فردية وجماعية، offline-first.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileEdit, Trash2, RefreshCw, Loader2, AlertCircle, Clock,
  Inbox, Upload, Eraser,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useAuthStore } from '@/store/auth.store';
import {
  listAdDrafts, deleteAdDraft, draftDisplayTitle, draftKindLabel,
  type AdDraft, type AdDraftStatus,
} from '@/lib/offlineAdDrafts';
import { resumeHrefForDraft } from '@/lib/offlineDraftResume';
import { syncPendingOfflineDrafts } from '@/lib/offlineDraftPublisher';

type TabKey = 'all' | 'draft' | 'failed' | 'synced';

const STATUS_LABEL: Record<AdDraftStatus, string> = {
  draft: 'مسودة',
  pending_sync: 'قيد الرفع',
  failed: 'فشل النشر',
  synced: 'منشور',
};

const STATUS_CLASS: Record<AdDraftStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_sync: 'bg-info/10 text-info dark:bg-info/20 dark:text-info',
  failed: 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive',
  synced: 'bg-success/10 text-success dark:bg-success/20 dark:text-success',
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'draft', label: 'مسودة' },
  { key: 'failed', label: 'فشل النشر' },
  { key: 'synced', label: 'منشور' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type ConfirmState =
  | { kind: 'one'; draft: AdDraft }
  | { kind: 'failed' }
  | { kind: 'synced' }
  | null;

export function DraftsCenterClient() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [drafts, setDrafts] = useState<AdDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>('all');
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listAdDrafts(userId);
      items.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
      setDrafts(items);
    } catch (err) {
      console.warn('[drafts-center] load failed', err);
      toast.error('تعذّر تحميل المسودات');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const counts = useMemo(() => {
    const c = { all: drafts.length, draft: 0, failed: 0, synced: 0 };
    for (const d of drafts) {
      if (d.status === 'failed') c.failed += 1;
      else if (d.status === 'synced') c.synced += 1;
      else c.draft += 1;
    }
    return c;
  }, [drafts]);

  const visible = useMemo(() => {
    if (tab === 'all') return drafts;
    if (tab === 'draft')
      return drafts.filter((d) => d.status === 'draft' || d.status === 'pending_sync');
    if (tab === 'failed') return drafts.filter((d) => d.status === 'failed');
    return drafts.filter((d) => d.status === 'synced');
  }, [drafts, tab]);

  async function publishFailed() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await syncPendingOfflineDrafts({ userId, includeFailed: true });
      if (res.sent > 0) toast.success(`تم نشر ${res.sent} مسودة`);
      if (res.failed > 0) toast.error(`فشل نشر ${res.failed} مسودة`);
      if (res.sent === 0 && res.failed === 0) toast.message('لا شيء للنشر الآن');
      await reload();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function deleteOne(draft: AdDraft) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteAdDraft(draft.id);
      toast.success('حُذفت المسودة');
      await reload();
    } catch {
      toast.error('تعذّر الحذف');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function deleteSynced() {
    if (busy) return;
    setBusy(true);
    try {
      const synced = drafts.filter((d) => d.status === 'synced');
      for (const d of synced) await deleteAdDraft(d.id);
      toast.success(`حُذف ${synced.length} مسودة منشورة`);
      await reload();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm({ kind: 'failed' })}
          disabled={busy || counts.failed === 0}
        >
          <Upload className="me-1.5 h-4 w-4" />
          نشر الفاشل ({counts.failed})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm({ kind: 'synced' })}
          disabled={busy || counts.synced === 0}
        >
          <Eraser className="me-1.5 h-4 w-4" />
          حذف المنشور ({counts.synced})
        </Button>
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading || busy}>
          <RefreshCw className={`me-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const count = t.key === 'all' ? counts.all : counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
                tab === t.key
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ التحميل…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {tab === 'all'
              ? 'لا مسودات — أي إعلان تبدأه بدون نت يُحفظ هنا تلقائياً.'
              : tab === 'failed'
                ? 'لا مسودات فاشلة — كل شيء على ما يرام.'
                : tab === 'synced'
                  ? 'لا مسودات منشورة بانتظار التنظيف.'
                  : 'لا مسودات قيد التحرير.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((d) => (
            <DraftRow
              key={d.id}
              draft={d}
              busy={busy}
              onDelete={() => setConfirm({ kind: 'one', draft: d })}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'one'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="حذف المسودة؟"
        description="لا يمكن التراجع عن هذا الإجراء."
        onConfirm={() => confirm?.kind === 'one' && deleteOne(confirm.draft)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'failed'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="نشر المسودات الفاشلة؟"
        description="ستُعاد المحاولة الآن. تحتاج اتصالاً بالإنترنت."
        onConfirm={publishFailed}
      />
      <ConfirmDialog
        open={confirm?.kind === 'synced'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="حذف المسودات المنشورة؟"
        description="لن يؤثر على الإعلانات المنشورة فعلياً."
        onConfirm={deleteSynced}
      />
    </div>
  );
}

function DraftRow({
  draft,
  busy,
  onDelete,
}: {
  draft: AdDraft;
  busy: boolean;
  onDelete: () => void;
}) {
  const title = draftDisplayTitle(draft);
  const kind = draftKindLabel(draft.kind ?? 'ad');
  const resumeHref = resumeHrefForDraft(draft);
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-2xs font-medium ${STATUS_CLASS[draft.status]}`}
            >
              {STATUS_LABEL[draft.status]}
            </span>
            <span className="text-2xs-tight text-muted-foreground">{kind}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm font-medium">{title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-2xs-tight text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDate(draft.updatedAt)}
          </p>
          {draft.status === 'failed' && draft.lastError && (
            <p className="mt-1 flex items-start gap-1 text-2xs-tight text-destructive">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-2">{draft.lastError}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button asChild variant="ghost" size="sm" disabled={busy}>
            <Link href={resumeHref} aria-label="تعديل المسودة">
              <FileEdit className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={busy}
            aria-label="حذف المسودة"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </li>
  );
}

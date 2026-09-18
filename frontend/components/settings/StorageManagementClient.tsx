'use client';

/**
 * إدارة التخزين والبيانات — أوضح، أجمل، وأكثر فائدة.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  HardDrive,
  Trash2,
  RefreshCw,
  Database,
  Image as ImageIcon,
  FileText,
  Package,
  Bookmark,
  MessageSquare,
  AlertTriangle,
  Download,
  FileEdit,
  WifiOff,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { DataSaverToggle } from '@/components/shared/DataSaverToggle';
import {
  collectStorageStats,
  clearCacheByName,
  clearAllMarketCaches,
  clearBrowsableCaches,
  formatStorageBytes,
  type StorageStats,
  type CacheBucketStat,
} from '@/lib/storageStats';
import { clearCatalogDownloads } from '@/lib/downloadStorage';
import { clearDraftOnlyAdDrafts } from '@/lib/offlineAdDrafts';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

function iconForCache(name: string) {
  if (name.includes('image')) return ImageIcon;
  if (name.includes('api')) return Database;
  if (name.includes('core')) return Package;
  if (name.includes('saved-ads')) return Bookmark;
  if (name.includes('personal-shell')) return MessageSquare;
  if (name.includes('static')) return FileText;
  return HardDrive;
}

export function StorageManagementClient() {
  // FIX STORAGE-STATS-USER-SCOPE: استخراج userId الحالي لتصفية المسودات
  // بحسب الملكية — بدون هذا، مسودات مستخدم آخر على نفس الجهاز تُحتسب.
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await collectStorageStats(userId);
      setStats(next);
    } catch {
      setError('تعذّر قراءة بيانات التخزين على هذا الجهاز.');
    } finally {
      setLoading(false);
    }
    // FIX STORAGE-STATS-USER-SCOPE: userId في deps — عند تسجيل الدخول/
    // الخروج يُعاد حساب الإحصائيات بالملكية الصحيحة.
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const runAction = async (key: string, action: () => Promise<void>, okMsg: string) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      await refresh();
      setToast(okMsg);
    } catch {
      setError('فشلت العملية. حاول مرة أخرى.');
    } finally {
      setBusy(null);
    }
  };

  const usagePct = useMemo(() => {
    if (!stats?.quotaBytes || !stats.usageBytes || stats.quotaBytes <= 0) return null;
    return Math.min(100, Math.round((stats.usageBytes / stats.quotaBytes) * 100));
  }, [stats]);

  if (!loading && stats && !stats.supported) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <HardDrive className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 font-medium">التخزين المحلي غير متاح في هذا المتصفح</p>
        <p className="mt-1 text-sm text-muted-foreground">
          جرّب متصفحًا حديثًا أو ثبّت التطبيق كـ PWA للاستفادة من العمل دون اتصال.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ملخص الحصة */}
      <section className="rounded-2xl border bg-card p-4 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">مساحة هذا الجهاز</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              تقدير المتصفح لما يستخدمه التطبيق محليًا
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || busy !== null}
            onClick={() => void refresh()}
            aria-label="تحديث الإحصائيات"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-end justify-between gap-2 text-sm">
            <span className="font-semibold tabular-nums">
              {loading ? '…' : formatStorageBytes(stats?.usageBytes ?? stats?.totalBytes ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              من أصل{' '}
              {stats?.quotaBytes != null ? formatStorageBytes(stats.quotaBytes) : '—'}
              {usagePct != null ? ` · ${usagePct}%` : ''}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                usagePct != null && usagePct >= 85
                  ? 'bg-destructive'
                  : usagePct != null && usagePct >= 60
                    ? 'bg-amber-500'
                    : 'bg-primary',
              )}
              style={{ width: `${usagePct ?? (loading ? 8 : 12)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            كاش التطبيق المقاس:{' '}
            <span className="font-medium text-foreground">
              {loading ? '…' : formatStorageBytes(stats?.totalBytes ?? 0)}
            </span>
            {' · '}
            {loading ? '…' : stats?.totalEntries ?? 0} عنصر
          </p>
        </div>
      </section>

      {/* توفير البيانات */}
      <section className="rounded-2xl border bg-card p-4 shadow-xs">
        <h2 className="text-sm font-semibold">توفير البيانات</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          يقلّل تحميل الصور الثقيلة على شبكات ضعيفة أو باقات محدودة
        </p>
        <div className="mt-3">
          <DataSaverToggle />
        </div>
      </section>

      {/* بيانات محلية هامة */}
      <section className="rounded-2xl border bg-card p-4 shadow-xs">
        <h2 className="text-sm font-semibold">بيانات محفوظة لديك</h2>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Download className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">كتالوجات المتاجر</p>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? '…'
                  : `${stats?.extras.catalogDownloads ?? 0} تنزيل · ${formatStorageBytes(stats?.extras.catalogBytes ?? 0)}`}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={ROUTES.downloads}>
                عرض
                <ExternalLink className="ms-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </li>
          <li className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileEdit className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">مسودات دون اتصال</p>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? '…'
                  : `${stats?.extras.offlineDrafts ?? 0} مسودة`}
                {!loading && (stats?.extras.pendingDrafts ?? 0) > 0
                  ? ` · ${stats?.extras.pendingDrafts} بانتظار المزامنة`
                  : ''}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={ROUTES.settings.sync}>
                المزامنة
                <WifiOff className="ms-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </li>
        </ul>
      </section>

      {/* تفاصيل الكاش */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">تفصيل الكاش</h2>
          <p className="text-xs text-muted-foreground">
            يمكنك مسح نوعًا واحدًا دون حذف كل شيء
          </p>
        </div>
        {loading && !stats ? (
          <div className="flex justify-center py-10">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : stats && stats.caches.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            لا يوجد كاش بعد — سيُبنى تلقائيًا أثناء التصفح
          </p>
        ) : (
          <ul className="divide-y">
            {stats?.caches.map((bucket) => (
              <CacheRow
                key={bucket.name}
                bucket={bucket}
                busy={busy === bucket.name}
                disabled={busy !== null || loading}
                onClear={() =>
                  void runAction(
                    bucket.name,
                    () => clearCacheByName(bucket.name),
                    `تم مسح «${bucket.label}»`,
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* إجراءات جماعية */}
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
        <h2 className="text-sm font-semibold">إجراءات سريعة</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            disabled={busy !== null || loading}
            onClick={() =>
              void runAction('browsable', () => clearBrowsableCaches(), 'تم مسح كاش التصفح')
            }
          >
            {busy === 'browsable' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            مسح كاش التصفح
            <span className="ms-auto text-[10px] font-normal text-muted-foreground">
              يبقي المحفوظات
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            disabled={busy !== null || loading || (stats?.extras.offlineDrafts ?? 0) === 0}
            onClick={() => {
              if (
                !window.confirm(
                  'مسح المسودات المحلية غير المُرسلة فقط؟ لن تُحذف العناصر قيد المزامنة إن وُجدت في الطابور بشكل منفصل.',
                )
              ) {
                return;
              }
              void runAction(
                'drafts',
                () => clearDraftOnlyAdDrafts(),
                'تم مسح المسودات المحلية',
              );
            }}
          >
            {busy === 'drafts' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <FileEdit className="h-4 w-4" />
            )}
            مسح المسودات المحلية
          </Button>

          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            disabled={busy !== null || loading || (stats?.extras.catalogDownloads ?? 0) === 0}
            onClick={() => {
              if (!window.confirm('حذف كل كتالوجات المتاجر المحمّلة على هذا الجهاز؟')) {
                return;
              }
              void runAction(
                'catalogs',
                async () => {
                  clearCatalogDownloads();
                },
                'تم حذف التنزيلات المحلية',
              );
            }}
          >
            {busy === 'catalogs' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            مسح التنزيلات
          </Button>

          <Button
            type="button"
            variant="destructive"
            className="justify-start gap-2"
            disabled={busy !== null || loading}
            onClick={() => {
              if (
                !window.confirm(
                  'مسح كل كاش التطبيق بما فيه الإعلانات المحفوظة دون اتصال؟ لا يمكن التراجع.',
                )
              ) {
                return;
              }
              void runAction('all', () => clearAllMarketCaches(), 'تم مسح كل الكاش');
            }}
          >
            {busy === 'all' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            مسح كل الكاش
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          مسح الكاش لا يحذف حسابك ولا بيانات السيرفر. يحرّر مساحة على هذا الجهاز فقط، وقد يُعاد
          بناء الكاش تلقائيًا عند التصفح.
        </p>
      </section>
    </div>
  );
}

function CacheRow({
  bucket,
  busy,
  disabled,
  onClear,
}: {
  bucket: CacheBucketStat;
  busy: boolean;
  disabled: boolean;
  onClear: () => void;
}) {
  const Icon = iconForCache(bucket.name);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{bucket.label}</p>
        <p className="text-xs text-muted-foreground">
          {formatStorageBytes(bucket.bytes)} · {bucket.entries} عنصر
        </p>
      </div>
      {bucket.clearable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={disabled || bucket.entries === 0}
          onClick={onClear}
          aria-label={`مسح ${bucket.label}`}
        >
          {busy ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      )}
    </li>
  );
}

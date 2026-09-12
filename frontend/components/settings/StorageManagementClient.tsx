'use client';

/**
 * واجهة إدارة التخزين المحلي للـ PWA —
 * مسار: /settings/storage (الإعدادات → التخزين والبيانات)
 */

import { useCallback, useEffect, useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  collectStorageStats,
  clearCacheByName,
  clearAllMarketCaches,
  clearBrowsableCaches,
  formatStorageBytes,
  type StorageStats,
  type CacheBucketStat,
} from '@/lib/storageStats';
import { cn } from '@/lib/utils';

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
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await collectStorageStats();
      setStats(next);
    } catch {
      setError('تعذّر قراءة بيانات التخزين على هذا الجهاز.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await refresh();
    } catch {
      setError('فشلت عملية المسح. أعد المحاولة.');
    } finally {
      setBusy(null);
    }
  }

  if (!loading && stats && !stats.supported) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        التخزين المؤقت غير متاح في هذا المتصفح.
      </p>
    );
  }

  const usageRatio =
    stats?.quotaBytes && stats.usageBytes != null && stats.quotaBytes > 0
      ? Math.min(100, Math.round((stats.usageBytes / stats.quotaBytes) * 100))
      : null;

  return (
    <div className="space-y-6">
      {/* ملخص */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HardDrive className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold">ملخص التخزين</h2>
              <p className="text-sm text-muted-foreground">
                {loading
                  ? 'جارٍ الحساب…'
                  : `${formatStorageBytes(stats?.totalBytes ?? 0)} · ${stats?.totalEntries ?? 0} عنصر في الكاش`}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading || busy !== null}
            aria-label="تحديث الإحصائيات"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        {usageRatio != null && stats && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                استخدام المتصفح: {formatStorageBytes(stats.usageBytes ?? 0)}
              </span>
              <span>
                من أصل {formatStorageBytes(stats.quotaBytes ?? 0)} ({usageRatio}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  usageRatio > 85 ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: `${usageRatio}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* قائمة الكاشات */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">الكاش والملفات دون اتصال</h2>
        {loading && !stats ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : (stats?.caches.length ?? 0) === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            لا توجد بيانات كاش محفوظة حاليًا.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {stats!.caches.map((bucket) => (
              <CacheRow
                key={bucket.name}
                bucket={bucket}
                busy={busy === bucket.name}
                disabled={busy !== null}
                onClear={() =>
                  void runAction(bucket.name, () => clearCacheByName(bucket.name))
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* إجراءات جماعية */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">إجراءات سريعة</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          مسح كاش التصفح يفرّغ الصفحات والصور وبيانات API المخزّنة مؤقتًا، ويبقي
          الإعلانات التي حفظتها يدويًا للعمل دون اتصال. المسح الكامل يحذف كل
          كاشات التطبيق بما فيها الإعلانات المحفوظة.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy !== null || loading}
            onClick={() =>
              void runAction('browsable', () => clearBrowsableCaches())
            }
          >
            {busy === 'browsable' ? (
              <RefreshCw className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="me-2 h-4 w-4" />
            )}
            مسح كاش التصفح
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={busy !== null || loading}
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                !window.confirm(
                  'هل تريد مسح كل بيانات الكاش بما فيها الإعلانات المحفوظة دون اتصال؟',
                )
              ) {
                return;
              }
              void runAction('all', () => clearAllMarketCaches());
            }}
          >
            {busy === 'all' ? (
              <RefreshCw className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="me-2 h-4 w-4" />
            )}
            مسح الكل
          </Button>
        </div>
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

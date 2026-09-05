'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Trash2, Store, FileText, WifiOff, Eye } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import {
  listCatalogDownloads,
  removeCatalogDownload,
  clearCatalogDownloads,
  openCatalogOffline,
  formatCatalogSize,
  type CatalogDownloadRecord,
} from '@/lib/downloadStorage';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function DownloadsPageClient() {
  const [items, setItems] = useState<CatalogDownloadRecord[]>([]);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(() => {
    setItems(listCatalogDownloads());
  }, []);

  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Download className="h-7 w-7" />}
        title="لا توجد تنزيلات بعد"
        description="حمّل كتالوج متجر من صفحة المتجر ليُحفظ هنا ويمكن فتحه لاحقًا حتى بدون نت."
        action={
          online ? (
            <Button asChild>
              <Link href={ROUTES.stores}>تصفح المتاجر</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {!online && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          أنت دون اتصال — يمكنك فتح الكتالوجات المحفوظة محليًا.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            if (confirm('مسح كل سجل التنزيلات والملفات المحلية؟')) {
              clearCatalogDownloads();
              refresh();
            }
          }}
        >
          مسح السجل
        </Button>
      </div>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 font-semibold">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{item.storeName}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {item.productCount} منتج · {item.fileName}
                {item.hasOfflineBody ? ' · متاح دون نت' : ''}
                {item.sizeBytes ? ` · ${formatCatalogSize(item.sizeBytes)}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                آخر تحديث: {formatDate(item.downloadedAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.hasOfflineBody && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    const ok = await openCatalogOffline(item.id);
                    if (!ok) toast.error('تعذّر فتح النسخة المحلية');
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  فتح دون نت
                </Button>
              )}
              {online && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={ROUTES.storeDetail(item.storeId)}>
                    <Store className="h-3.5 w-3.5" />
                    المتجر
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={async () => {
                  await removeCatalogDownload(item.id);
                  refresh();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                إزالة من المحفوظات
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

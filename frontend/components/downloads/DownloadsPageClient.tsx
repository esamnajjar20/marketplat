'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Trash2, Store, FileText, WifiOff, Eye, Search } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
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
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

// toLocaleString never throws — an invalid
// date produces the string "Invalid Date", not an exception. The old
// try/catch was dead code; the `iso` fallback never ran.
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
   timeZone: 'Asia/Gaza'});
}

export function DownloadsPageClient() {
  const [items, setItems] = useState<CatalogDownloadRecord[]>([]);
  const online = useOnlineStatus();
  const [query, setQuery] = useState('');
  // replace window.confirm with shared ConfirmDialog.
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const refresh = useCallback(() => {
    setItems(listCatalogDownloads());
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.storeName.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    refresh();
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
        <p className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-strong dark:text-warning">
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
          onClick={() => setConfirmClearOpen(true)}
        >
          مسح السجل
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث في التنزيلات…"
          className="h-11 ps-10"
          aria-label="بحث في التنزيلات"
        />
      </div>

      <ul className="space-y-3">
        {filteredItems.map((item) => (
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

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="مسح كل سجل التنزيلات؟"
        description="سيتم حذف كل الكتالوجات المحفوظة على هذا الجهاز. لا يمكن التراجع."
        confirmLabel="مسح الكل"
        destructive
        onConfirm={async () => {
          await clearCatalogDownloads();
          refresh();
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
}

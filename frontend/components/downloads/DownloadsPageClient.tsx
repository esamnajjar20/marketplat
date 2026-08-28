'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Trash2, Store, FileText } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import {
  listCatalogDownloads,
  removeCatalogDownload,
  clearCatalogDownloads,
  type CatalogDownloadRecord,
} from '@/lib/downloadStorage';
import { ROUTES } from '@/lib/constants';

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

  const refresh = useCallback(() => {
    setItems(listCatalogDownloads());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Download className="h-7 w-7" />}
        title="لا توجد تنزيلات بعد"
        description="عند تحميل كتالوج متجر من صفحة المتجر، سيظهر هنا سجل التنزيل مع رابط للمتجر."
        action={
          <Button asChild>
            <Link href={ROUTES.stores}>تصفح المتاجر</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            if (confirm('مسح كل سجل التنزيلات؟')) {
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
              </p>
              <p className="text-xs text-muted-foreground">{formatDate(item.downloadedAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="default" size="sm" className="gap-1.5" asChild>
                <Link href={ROUTES.storeDetail(item.storeId)}>
                  <Store className="h-3.5 w-3.5" />
                  المتجر / إعادة التحميل
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={() => {
                  removeCatalogDownload(item.id);
                  refresh();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

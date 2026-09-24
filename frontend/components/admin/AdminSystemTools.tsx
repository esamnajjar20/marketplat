'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { adminApi } from '@/api/admin.api';
import { toast } from 'sonner';

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // SW-FIX-TOOLS-REVOKE: defer as in AdminExportButton / DownloadStoreCatalogButton.
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function AdminSystemTools() {
  const [busy, setBusy] = useState<'users' | 'reports' | null>(null);

  async function exportUsers() {
    setBusy('users');
    try {
      const res = await adminApi.exportUsersCsv();
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data as BlobPart], { type: 'text/csv' });
      await downloadBlob(blob, `users-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('تم تنزيل ملف المستخدمين');
    } catch {
      toast.error('تعذّر تصدير المستخدمين');
    } finally {
      setBusy(null);
    }
  }

  async function exportReports() {
    setBusy('reports');
    try {
      const res = await adminApi.exportReportsCsv();
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data as BlobPart], { type: 'text/csv' });
      await downloadBlob(blob, `reports-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('تم تنزيل ملف البلاغات');
    } catch {
      toast.error('تعذّر تصدير البلاغات');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">أدوات التصدير</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        تنزيل بيانات CSV للمراجعة الخارجية أو النسخ الاحتياطي اليدوي.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="justify-start gap-2"
          disabled={busy !== null}
          onClick={() => void exportUsers()}
        >
          {busy === 'users' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          تصدير المستخدمين (CSV)
        </Button>
        <Button
          type="button"
          variant="outline"
          className="justify-start gap-2"
          disabled={busy !== null}
          onClick={() => void exportReports()}
        >
          {busy === 'reports' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          تصدير البلاغات (CSV)
        </Button>
      </div>
    </div>
  );
}

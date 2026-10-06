'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { adminApi } from '@/api/admin.api';
import { toast } from 'sonner';

type Kind = 'users' | 'reports';

async function downloadBlob(kind: Kind) {
  const res =
    kind === 'users'
      ? await adminApi.exportUsersCsv()
      : await adminApi.exportReportsCsv();
  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = kind === 'users' ? 'users.csv' : 'reports.csv';
  a.click();
  // Safari iOS can abort the download if the URL
  // is revoked in the same tick as click() — defer to match
  // DownloadStoreCatalogButton's fix.
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function AdminExportButton({ kind, label }: { kind: Kind; label: string }) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await downloadBlob(kind);
          toast.success('تم تنزيل الملف');
        } catch {
          toast.error('تعذّر التصدير');
        } finally {
          setPending(false);
        }
      }}
    >
      <Download className="h-3.5 w-3.5" />
      {pending ? 'جارٍ التصدير…' : label}
    </Button>
  );
}

'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { conversationsApi } from '@/api/conversations.api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  conversationId: string;
  messageId: string;
  kind: 'image' | 'audio' | 'file';
  fileName?: string | null;
  className?: string;
  label?: string;
}

export function MediaDownloadButton({ conversationId, messageId, kind, fileName, className, label = 'تحميل الملف' }: Props) {
  const [loading, setLoading] = useState(false);
  async function download() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await conversationsApi.downloadMedia(conversationId, messageId, kind);
      const blob = response.data;
      if (!(blob instanceof Blob) || blob.size === 0) throw new Error('empty download');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || (kind === 'audio' ? `voice-${messageId}.webm` : 'attachment');
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success('بدأ تحميل الملف');
    } catch {
      toast.error('تعذّر تحميل الملف. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <button type="button" onClick={() => void download()} disabled={loading} className={cn('inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60', className)} aria-label={label}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span>{loading ? 'جارٍ التحميل…' : label}</span>
    </button>
  );
}

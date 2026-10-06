'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Music2 } from 'lucide-react';
import { MessageImageViewer } from './MessageImageViewer';
import { SafeImg } from '@/components/shared/ui/SafeImg';
import type { Message } from '@/types/conversation.types';
import type { QueuedMessageEntry } from '@/lib/offlineMessagesQueue';
import { cacheConversationMediaBlobs, getOrCacheConversationMediaBlob } from '@/lib/conversationMediaStore';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { getThumbnailUrl } from '@/lib/cloudinary';

import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { MediaDownloadButton } from './MediaDownloadButton';

interface Props {
  items: Message[];
  queuedItems?: QueuedMessageEntry[];
  conversationId?: string;
  loading?: boolean;
}

type Kind = 'all' | 'images' | 'audio' | 'files';
type GalleryItem = Message & { localUrl?: string; localBlob?: Blob; queued?: boolean };

function formatBytes(size?: number | null) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1048576) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1048576).toFixed(1)} MB`;
}

export function MessageMediaGallery({ items, queuedItems = [], conversationId = '', loading }: Props) {
  const userId = useAuthStore(selectUser)?.id ?? null;
  const isOnline = useOnlineStatus();
  const [kind, setKind] = useState<Kind>('all');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});

  const queuedMedia = useMemo<GalleryItem[]>(() => queuedItems
    .filter((q) => Boolean(q.attachment))
    .map((q) => {
      const a = q.attachment!;
      return {
        id: `queued-${q.queueId}`,
        conversationId,
        senderId: userId ?? '',
        body: q.body,
        imageUrl: a.kind === 'image' ? URL.createObjectURL(a.blob) : null,
        audioUrl: a.kind === 'audio' ? URL.createObjectURL(a.blob) : null,
        fileUrl: a.kind === 'file' ? URL.createObjectURL(a.blob) : null,
        fileName: a.name,
        fileMimeType: a.mimeType,
        fileSize: a.size,
        readAt: null,
        deletedAt: null,
        createdAt: new Date(q.queuedAt).toISOString(),
        queued: true,
      };
    }), [conversationId, queuedItems, userId]);

  // The queue-derived object URLs above must be revoked whenever the queue snapshot changes.
  useEffect(() => () => {
    for (const item of queuedMedia) {
      if (item.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(item.imageUrl);
      if (item.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(item.audioUrl);
      if (item.fileUrl?.startsWith('blob:')) URL.revokeObjectURL(item.fileUrl);
    }
  }, [queuedMedia]);

  // Hydrate from IndexedDB first. When online, also backfill missing blobs
  // through the same-origin backend proxy if the storage provider blocks CORS.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    async function hydrate() {
      if (!userId || !conversationId) return;
      if (isOnline) {
        await cacheConversationMediaBlobs(userId, conversationId, items);
      }
      const next: Record<string, string> = {};
      await Promise.all(items.flatMap((item) => {
        const jobs: Promise<void>[] = [];
        const kinds: Array<[keyof Pick<Message, 'imageUrl' | 'audioUrl' | 'fileUrl'>, 'image' | 'audio' | 'file']> = [
          ['imageUrl', 'image'], ['audioUrl', 'audio'], ['fileUrl', 'file'],
        ];
        for (const [field, mediaKind] of kinds) {
          const remoteUrl = item[field];
          if (!remoteUrl) continue;
          jobs.push(getOrCacheConversationMediaBlob(userId, conversationId, item.id, mediaKind, remoteUrl).then((blob) => {
            if (!blob || cancelled) return;
            const url = URL.createObjectURL(blob);
            created.push(url);
            next[`${item.id}:${mediaKind}`] = url;
          }));
        }
        return jobs;
      }));
      if (!cancelled) setLocalUrls(next);
      else created.forEach((url) => URL.revokeObjectURL(url));
    }
    void hydrate();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [conversationId, isOnline, items, userId]);

  const allItems = useMemo(() => [...items, ...queuedMedia], [items, queuedMedia]);
  const getUrl = useCallback((item: GalleryItem, kind: 'image' | 'audio' | 'file') => {
    if (kind === 'image') return item.imageUrl?.startsWith('blob:') ? item.imageUrl : localUrls[`${item.id}:image`] ?? item.imageUrl ?? undefined;
    if (kind === 'audio') return item.audioUrl?.startsWith('blob:') ? item.audioUrl : localUrls[`${item.id}:audio`] ?? item.audioUrl ?? undefined;
    return item.fileUrl?.startsWith('blob:') ? item.fileUrl : localUrls[`${item.id}:file`] ?? item.fileUrl ?? undefined;
  }, [localUrls]);

  const filtered = useMemo(() => allItems.filter((m) => {
    if (kind === 'all') return Boolean(m.imageUrl || m.audioUrl || m.fileUrl);
    if (kind === 'images') return Boolean(m.imageUrl);
    if (kind === 'audio') return Boolean(m.audioUrl);
    return Boolean(m.fileUrl);
  }), [allItems, kind]);
  const imageItems = useMemo(() => filtered.filter((item) => Boolean(item.imageUrl)), [filtered]);
  const counts = {
    images: allItems.filter((m) => m.imageUrl).length,
    audio: allItems.filter((m) => m.audioUrl).length,
    files: allItems.filter((m) => m.fileUrl).length,
  };

  const cacheOnError = useCallback(async (item: GalleryItem, mediaKind: 'image' | 'audio' | 'file') => {
    if (!userId || !conversationId || item.queued) return;
    const remoteUrl = mediaKind === 'image' ? item.imageUrl : mediaKind === 'audio' ? item.audioUrl : item.fileUrl;
    const blob = await getOrCacheConversationMediaBlob(userId, conversationId, item.id, mediaKind, remoteUrl);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setLocalUrls((current) => {
      const previous = current[`${item.id}:${mediaKind}`];
      if (previous) URL.revokeObjectURL(previous);
      return { ...current, [`${item.id}:${mediaKind}`]: url };
    });
  }, [conversationId, userId]);

  if (loading && !allItems.length) return <div className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل الوسائط…</div>;
  if (!allItems.length) return <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">لا توجد صور أو تسجيلات أو ملفات في هذه المحادثة.</div>;

  const tabs: [Kind, string, number][] = [['all', 'الكل', counts.images + counts.audio + counts.files], ['images', 'الصور', counts.images], ['audio', 'الصوت', counts.audio], ['files', 'الملفات', counts.files]];

  return <>
    <div className="mb-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="نوع الوسائط">
      {tabs.map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-medium', kind === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{label} <span className="opacity-70">{count}</span></button>)}
    </div>

    {!filtered.length ? <div className="py-8 text-center text-sm text-muted-foreground">لا توجد وسائط من هذا النوع.</div> :
      <div className="grid max-h-[min(60vh,520px)] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {filtered.map((item) => {
          const imageUrl = getUrl(item, 'image');
          const audioUrl = getUrl(item, 'audio');
          const fileUrl = getUrl(item, 'file');
          if (item.imageUrl && imageUrl) return <button key={item.id} type="button" onClick={() => setPreviewIndex(imageItems.findIndex((image) => image.id === item.id))} className="group relative aspect-square overflow-hidden rounded-xl bg-muted" aria-label="معاينة صورة"><SafeImg src={imageUrl?.startsWith('blob:') ? imageUrl : getThumbnailUrl(imageUrl, 320, 320)} alt="صورة من المحادثة" className="h-full w-full object-cover transition group-hover:scale-105" onError={() => void cacheOnError(item, 'image')} /></button>;
          if (item.audioUrl && audioUrl) return <div key={item.id} className="col-span-2 flex min-h-24 flex-col justify-center gap-2 rounded-xl border border-border/70 bg-muted/40 p-3 sm:col-span-1"><div className="flex items-center gap-2 text-xs font-medium"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><Music2 className="h-4 w-4" /></span>{(item as { queued?: unknown }).queued ? 'تسجيل صوتي — بانتظار الإرسال' : 'تسجيل صوتي'}</div><VoiceMessagePlayer src={audioUrl} variant="theirs" onError={() => void cacheOnError(item, 'audio')} /><MediaDownloadButton conversationId={conversationId} messageId={item.id} kind="audio" fileName={item.fileName ?? `voice-${item.id}.webm`} label="تحميل التسجيل" /></div>;
          return <div key={item.id} className="flex min-h-24 flex-col justify-between rounded-xl border border-border/70 bg-muted/40 p-3"><div className="flex min-w-0 items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span><span className="min-w-0 truncate text-xs font-medium" title={item.fileName ?? undefined}>{item.fileName ?? 'ملف'}</span></div><div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>{formatBytes(item.fileSize)}</span><span className="flex gap-2">{fileUrl && <><a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary" aria-label="فتح الملف" onClick={() => void cacheOnError(item, 'file')}><ExternalLink className="h-3.5 w-3.5" /></a><MediaDownloadButton conversationId={conversationId} messageId={item.id} kind="file" fileName={item.fileName} label="تحميل" className="h-8 min-h-8 px-2" /></>}</span></div></div>;
        })}
      </div>}

    <MessageImageViewer
      images={imageItems.map((item) => ({ id: item.id, imageUrl: getUrl(item, 'image')!, alt: 'صورة من المحادثة' }))}
      initialIndex={previewIndex ?? 0}
      open={previewIndex !== null}
      onOpenChange={(open) => !open && setPreviewIndex(null)}
    />
  </>;
}

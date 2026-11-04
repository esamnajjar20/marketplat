'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Music2 } from 'lucide-react';
import { MessageImageViewer } from './MessageImageViewer';
import { SafeImg } from '@/components/shared/ui/SafeImg';
import type { Message } from '@/types/conversation.types';
import type { QueuedMessageEntry } from '@/lib/offlineMessagesQueue';
import {
  getConversationMediaBlob,
  getOrCacheConversationMediaBlob,
} from '@/lib/conversationMediaStore';
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
type MediaKind = 'image' | 'audio' | 'file';
type GalleryItem = Message & { queued?: boolean; queueId?: number };
const EMPTY_QUEUED_ITEMS: QueuedMessageEntry[] = [];
const MEDIA_FIELDS: ReadonlyArray<readonly [keyof Pick<Message, 'imageUrl' | 'audioUrl' | 'fileUrl'>, MediaKind]> = [
  ['imageUrl', 'image'],
  ['audioUrl', 'audio'],
  ['fileUrl', 'file'],
];

function formatBytes(size?: number | null) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1048576) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1048576).toFixed(1)} MB`;
}

async function runWithConcurrency<T>(
  tasks: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      const item = tasks[index];
      if (item !== undefined) await task(item);
    }
  });
  await Promise.all(workers);
}

function localUrlKey(conversationId: string, messageId: string, kind: MediaKind): string {
  return `${conversationId}:${messageId}:${kind}`;
}

export function MessageMediaGallery({
  items,
  queuedItems = EMPTY_QUEUED_ITEMS,
  conversationId = '',
  loading,
}: Props) {
  const userId = useAuthStore(selectUser)?.id ?? null;
  const isOnline = useOnlineStatus();
  const [kind, setKind] = useState<Kind>('all');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const [queuedUrls, setQueuedUrls] = useState<Record<string, string>>({});
  const ownedLocalUrlsRef = useRef<Map<string, string>>(new Map());
  const mountedRef = useRef(false);
  const activeConversationRef = useRef(conversationId);

  // Build queue metadata without allocating Blob URLs during render.
  const queuedBase = useMemo<GalleryItem[]>(() => queuedItems
    .filter((entry) => Boolean(entry.attachment))
    .map((entry) => {
      const attachment = entry.attachment;
      const timestamp = Number.isFinite(entry.queuedAt) ? entry.queuedAt : 0;
      return {
        id: `queued-${entry.queueId}`,
        queueId: entry.queueId,
        conversationId,
        senderId: userId ?? '',
        body: entry.body,
        imageUrl: null,
        audioUrl: null,
        fileUrl: null,
        fileName: attachment?.name ?? null,
        fileMimeType: attachment?.mimeType ?? null,
        fileSize: attachment?.size ?? null,
        readAt: null,
        deletedAt: null,
        createdAt: new Date(timestamp).toISOString(),
        queued: true,
      };
    }), [conversationId, queuedItems, userId]);

  // Blob URLs are owned by this committed effect and revoked when the queue
  // snapshot changes or the gallery unmounts.
  useEffect(() => {
    const next: Record<string, string> = {};
    const created: string[] = [];
    for (const entry of queuedItems) {
      const attachment = entry.attachment;
      if (!attachment) continue;
      const url = URL.createObjectURL(attachment.blob);
      created.push(url);
      next[`${entry.queueId}:${attachment.kind}`] = url;
    }
    setQueuedUrls(next);
    return () => {
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [queuedItems]);

  const queuedMedia = useMemo<GalleryItem[]>(() => queuedBase.map((item) => {
    const queueId = item.queueId;
    const attachment = queuedItems.find((entry) => entry.queueId === queueId)?.attachment;
    const url = queueId !== undefined && attachment
      ? queuedUrls[`${queueId}:${attachment.kind}`] ?? null
      : null;
    return {
      ...item,
      imageUrl: attachment?.kind === 'image' ? url : null,
      audioUrl: attachment?.kind === 'audio' ? url : null,
      fileUrl: attachment?.kind === 'file' ? url : null,
    };
  }), [queuedBase, queuedItems, queuedUrls]);

  const registerLocalUrl = useCallback((messageId: string, mediaKind: MediaKind, blob: Blob) => {
    // Async cache reads may settle after the modal closes or the user switches
    // conversations. Never create a new URL after cleanup for a stale scope.
    if (!mountedRef.current || activeConversationRef.current !== conversationId) return;
    const key = localUrlKey(conversationId, messageId, mediaKind);
    const previous = ownedLocalUrlsRef.current.get(key);
    if (previous) URL.revokeObjectURL(previous);
    const nextUrl = URL.createObjectURL(blob);
    ownedLocalUrlsRef.current.set(key, nextUrl);
    setLocalUrls(Object.fromEntries(ownedLocalUrlsRef.current));
  }, [conversationId]);

  // Hydrate only existing local Blob records with a strict concurrency cap.
  // Network backfill is triggered by the media query, not by opening this UI.
  useEffect(() => {
    let cancelled = false;
    const validKeys = new Set<string>();
    for (const item of items) {
      for (const [field, mediaKind] of MEDIA_FIELDS) {
        if (item[field]) validKeys.add(localUrlKey(conversationId, item.id, mediaKind));
      }
    }
    for (const [key, url] of ownedLocalUrlsRef.current) {
      if (!validKeys.has(key)) {
        URL.revokeObjectURL(url);
        ownedLocalUrlsRef.current.delete(key);
      }
    }
    setLocalUrls(Object.fromEntries(ownedLocalUrlsRef.current));

    async function hydrate() {
      if (!userId || !conversationId) return;
      const tasks = items.flatMap((item) => MEDIA_FIELDS.flatMap(([field, mediaKind]) => {
        const remoteUrl = item[field];
        if (!remoteUrl) return [];
        return [{ item, mediaKind, remoteUrl }];
      }));
      await runWithConcurrency(tasks, 3, async ({ item, mediaKind }) => {
        // Opening the gallery is a read-only cache operation. Bulk remote
        // downloads are owned by the bounded 15-item background backfill
        // above; an individual media error may still request a targeted fetch.
        const blob = await getConversationMediaBlob(
          userId,
          conversationId,
          item.id,
          mediaKind,
        );
        if (!blob || cancelled) return;
        const key = localUrlKey(conversationId, item.id, mediaKind);
        if (ownedLocalUrlsRef.current.has(key)) return;
        const url = URL.createObjectURL(blob);
        ownedLocalUrlsRef.current.set(key, url);
      });
      if (!cancelled) setLocalUrls(Object.fromEntries(ownedLocalUrlsRef.current));
    }

    void hydrate().catch(() => {
      // The remote URL remains usable; a later online render can retry cache hydration.
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, isOnline, items, userId]);

  useEffect(() => {
    mountedRef.current = true;
    activeConversationRef.current = conversationId;
    return () => {
      mountedRef.current = false;
      for (const url of ownedLocalUrlsRef.current.values()) URL.revokeObjectURL(url);
      ownedLocalUrlsRef.current.clear();
    };
  }, [conversationId]);

  const allItems = useMemo<GalleryItem[]>(() => [...items, ...queuedMedia], [items, queuedMedia]);
  const getUrl = useCallback((item: GalleryItem, mediaKind: MediaKind) => {
    const field = mediaKind === 'image' ? 'imageUrl' : mediaKind === 'audio' ? 'audioUrl' : 'fileUrl';
    const originalUrl = item[field];
    if (item.queued) return originalUrl ?? undefined;
    return localUrls[localUrlKey(conversationId, item.id, mediaKind)] ?? originalUrl ?? undefined;
  }, [conversationId, localUrls]);

  const filtered = useMemo(() => allItems.filter((item) => {
    if (kind === 'all') return Boolean(item.imageUrl || item.audioUrl || item.fileUrl);
    if (kind === 'images') return Boolean(item.imageUrl);
    if (kind === 'audio') return Boolean(item.audioUrl);
    return Boolean(item.fileUrl);
  }), [allItems, kind]);
  const imageItems = useMemo(() => filtered.filter((item) => Boolean(item.imageUrl)), [filtered]);
  const counts = useMemo(() => ({
    images: allItems.filter((item) => item.imageUrl).length,
    audio: allItems.filter((item) => item.audioUrl).length,
    files: allItems.filter((item) => item.fileUrl).length,
  }), [allItems]);
  const tabs: Array<readonly [Kind, string, number]> = [
    ['all', 'الكل', counts.images + counts.audio + counts.files],
    ['images', 'الصور', counts.images],
    ['audio', 'الصوت', counts.audio],
    ['files', 'الملفات', counts.files],
  ];

  const cacheOnError = useCallback(async (item: GalleryItem, mediaKind: MediaKind) => {
    if (!isOnline || !userId || !conversationId || item.queued) return;
    const field = mediaKind === 'image' ? 'imageUrl' : mediaKind === 'audio' ? 'audioUrl' : 'fileUrl';
    const blob = await getOrCacheConversationMediaBlob(
      userId,
      conversationId,
      item.id,
      mediaKind,
      item[field],
    );
    if (blob) registerLocalUrl(item.id, mediaKind, blob);
  }, [conversationId, isOnline, registerLocalUrl, userId]);

  if (loading && !allItems.length) {
    return <div className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل الوسائط…</div>;
  }
  if (!allItems.length) {
    return <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">لا توجد صور أو تسجيلات أو ملفات في هذه المحادثة.</div>;
  }

  return <>
    <div className="mb-3 flex gap-1 overflow-x-auto overscroll-x-contain pb-1" role="tablist" aria-label="نوع الوسائط">
      {tabs.map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-medium', kind === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{label} <span className="opacity-70">{count}</span></button>)}
    </div>

    {!filtered.length ? <div className="py-8 text-center text-sm text-muted-foreground">لا توجد وسائط من هذا النوع.</div> :
      <div className="grid max-h-[min(60vh,520px)] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {filtered.map((item) => {
          const imageUrl = getUrl(item, 'image');
          const audioUrl = getUrl(item, 'audio');
          const fileUrl = getUrl(item, 'file');
          if (item.imageUrl && imageUrl) return <button key={item.id} type="button" onClick={() => setPreviewIndex(imageItems.findIndex((image) => image.id === item.id))} className="group relative aspect-square overflow-hidden rounded-xl bg-muted" aria-label="معاينة صورة"><SafeImg src={imageUrl.startsWith('blob:') ? imageUrl : getThumbnailUrl(imageUrl, 320, 320)} alt="صورة من المحادثة" className="h-full w-full object-cover transition group-hover:scale-105" onError={() => void cacheOnError(item, 'image')} /></button>;
          if (item.audioUrl && audioUrl) return <div key={item.id} className="col-span-2 flex min-h-24 flex-col justify-center gap-2 rounded-xl border border-border/70 bg-muted/40 p-3 sm:col-span-1"><div className="flex items-center gap-2 text-xs font-medium"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><Music2 className="h-4 w-4" /></span>{item.queued ? 'تسجيل صوتي — بانتظار الإرسال' : 'تسجيل صوتي'}</div><VoiceMessagePlayer src={audioUrl} variant="theirs" onError={() => void cacheOnError(item, 'audio')} /><MediaDownloadButton conversationId={conversationId} messageId={item.id} kind="audio" fileName={item.fileName ?? `voice-${item.id}.webm`} label="تحميل التسجيل" /></div>;
          return <div key={item.id} className="flex min-h-24 flex-col justify-between rounded-xl border border-border/70 bg-muted/40 p-3"><div className="flex min-w-0 items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span><span className="min-w-0 truncate text-xs font-medium" title={item.fileName ?? undefined}>{item.fileName ?? 'ملف'}</span></div><div className="flex items-center justify-between text-2xs text-muted-foreground"><span>{formatBytes(item.fileSize)}</span><span className="flex gap-2">{fileUrl && <><a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary" aria-label="فتح الملف" onClick={() => void cacheOnError(item, 'file')}><ExternalLink className="h-3.5 w-3.5" /></a><MediaDownloadButton conversationId={conversationId} messageId={item.id} kind="file" fileName={item.fileName} label="تحميل" className="h-8 min-h-8 px-2" /></>}</span></div></div>;
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

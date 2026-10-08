'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Trash2, X } from 'lucide-react';
import { getFullscreenImageUrl, getAvatarUrl } from '@/lib/cloudinary';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { useDeleteStory, useViewStory } from '@/hooks/mutations/useStoryMutations';
import { useStoryViewers } from '@/hooks/queries/useStories';
import type { StoryGroup } from '@/api/stories.api';

export function StoryViewer({ group, onClose }: { group: StoryGroup; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const story = group.stories[index];
  const { mutate: markViewed } = useViewStory();
  const remove = useDeleteStory();
  const { data: viewers = [] } = useStoryViewers(story?.id ?? '', showViewers && Boolean(story?.isOwner));
  const progress = useMemo(() => group.stories.map((_, i) => i <= index ? 100 : 0), [group.stories, index]);

  useEffect(() => {
    if (!story) return;
    if (!story.viewed && !story.isOwner) markViewed(story.id);
    const timer = window.setTimeout(() => {
      if (index < group.stories.length - 1) setIndex((i) => i + 1);
      else onClose();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [story?.id, story?.viewed, story?.isOwner, index, group.stories.length, onClose, markViewed]);

  if (!story) return null;

  async function deleteCurrent() {
    if (!story) return;
    await remove.mutateAsync(story.id);
    if (index < group.stories.length - 1) setIndex((i) => i + 1);
    else onClose();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`ستوري ${group.user.name}`}>
      <div className="relative h-full w-full max-w-md overflow-hidden bg-black sm:h-[92vh] sm:rounded-3xl sm:shadow-2xl">
        <div className="absolute inset-x-3 top-3 z-20 flex gap-1">{group.stories.map((_, i) => <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${progress[i] ?? 0}%`, transition: i === index ? 'width 5s linear' : undefined }} /></div>)}</div>
        <div className="absolute inset-x-4 top-7 z-20 flex items-center justify-between text-white"><div className="flex items-center gap-2"><SafeImage variant="avatar" src={getAvatarUrl(group.user.avatarUrl ?? '', 72)} alt="" width={38} height={38} className="h-9 w-9 rounded-full object-cover ring-2 ring-white/30" /><div><p className="text-sm font-semibold">{group.user.name}</p><p className="text-[10px] text-white/70">{new Date(story.createdAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</p></div></div><div className="flex items-center gap-1"><button type="button" onClick={() => setShowViewers((v) => !v)} className="rounded-full bg-black/30 p-2 hover:bg-black/50" aria-label="المشاهدون"><Eye className="h-5 w-5" /></button>{story.isOwner && <button type="button" onClick={deleteCurrent} className="rounded-full bg-black/30 p-2 hover:bg-red-500/70" aria-label="حذف"><Trash2 className="h-5 w-5" /></button>}<button type="button" onClick={onClose} className="rounded-full bg-black/30 p-2 hover:bg-black/50" aria-label="إغلاق"><X className="h-5 w-5" /></button></div></div>

        {story.mediaUrl ? <SafeImage src={getFullscreenImageUrl(story.mediaUrl, 1000)} alt="" fill priority className="object-contain" sizes="(max-width: 640px) 100vw, 448px" /> : <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${story.background ?? 'from-slate-900 to-slate-700'} p-8 text-center text-3xl font-bold leading-relaxed text-white`}>{story.text}</div>}
        {story.mediaUrl && story.text && <div className="absolute inset-x-5 bottom-8 rounded-2xl bg-black/45 px-4 py-3 text-center text-lg font-semibold text-white backdrop-blur-sm">{story.text}</div>}

        <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="absolute start-2 top-1/2 z-20 rounded-full bg-black/20 p-2 text-white disabled:invisible"><ChevronLeft className="h-7 w-7" /></button>
        <button type="button" onClick={() => index < group.stories.length - 1 ? setIndex((i) => i + 1) : onClose()} className="absolute end-2 top-1/2 z-20 rounded-full bg-black/20 p-2 text-white"><ChevronRight className="h-7 w-7" /></button>

        {showViewers && story.isOwner && <div className="absolute inset-x-3 bottom-3 z-30 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-black/75 p-3 text-white backdrop-blur-xl"><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">المشاهدون ({story.viewCount})</span><button onClick={() => setShowViewers(false)} className="text-white/60">إغلاق</button></div>{viewers.length === 0 ? <p className="text-xs text-white/60">لا توجد مشاهدات بعد.</p> : viewers.map((item) => <div key={item.viewer.id} className="flex items-center gap-2 border-b border-white/10 py-2 last:border-0"><SafeImage variant="avatar" src={getAvatarUrl(item.viewer.avatarUrl ?? '', 48)} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" /><span className="text-sm">{item.viewer.name}</span></div>)}</div>}
      </div>
    </div>
  );
}

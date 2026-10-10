'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { useStoryFeed } from '@/hooks/queries/useStories';
import { StoryComposer } from './StoryComposer';
import { StoryViewer } from './StoryViewer';
import { getAvatarUrl } from '@/lib/cloudinary';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import type { StoryGroup } from '@/api/stories.api';

export function StoriesRail() {
  const authenticated = useAuthStore(selectIsAuthenticated);
  const { data: groups = [], isLoading } = useStoryFeed();
  const [composerOpen, setComposerOpen] = useState(false);
  const [active, setActive] = useState<StoryGroup | null>(null);
  if (!authenticated) return null;

  return (
    <>
      <section className="rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between px-1"><div><h2 className="text-sm font-bold">القصص</h2><p className="text-[11px] text-muted-foreground">تختفي بعد 24 ساعة</p></div><Link href="/stories" prefetch={false} className="text-xs font-medium text-primary hover:underline">عرض الكل</Link></div>
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button type="button" onClick={() => setComposerOpen(true)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary/50 bg-primary/5"><Plus className="h-5 w-5 text-primary" /></span><span className="max-w-16 truncate text-[11px]">قصتك</span>
          </button>
          {isLoading && Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-muted" />)}
          {groups.map((group) => <button key={group.user.id} type="button" onClick={() => setActive(group)} className="flex w-16 shrink-0 flex-col items-center gap-1.5"><span className={`rounded-full p-[2px] ${group.hasUnseen ? 'bg-gradient-to-tr from-amber-500 via-pink-500 to-violet-600' : 'bg-border'}`}><span className="block rounded-full border-2 border-background"><SafeImage variant="avatar" src={getAvatarUrl(group.user.avatarUrl ?? '', 72)} alt="" width={52} height={52} className="h-[52px] w-[52px] rounded-full object-cover" /></span></span><span className="max-w-16 truncate text-[11px]">{group.user.id === useAuthStore.getState().user?.id ? 'أنت' : group.user.name}</span></button>)}
        </div>
      </section>
      {composerOpen && <StoryComposer onClose={() => setComposerOpen(false)} />}
      {active && <StoryViewer group={active} onClose={() => setActive(null)} />}
    </>
  );
}

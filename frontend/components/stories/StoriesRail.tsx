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
  const { data: groups = [], isLoading, isError, refetch } = useStoryFeed();
  const [composerOpen, setComposerOpen] = useState(false);
  const [active, setActive] = useState<StoryGroup | null>(null);
  if (!authenticated) return null;

  return (
    <>
      <section className="rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3 px-1"><div><h2 className="text-sm font-bold">القصص</h2><p className="text-[11px] text-muted-foreground">قصص الأشخاص · تختفي بعد 24 ساعة</p></div><Link href="/stories" prefetch={false} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">عرض الكل</Link></div>
        <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none]" aria-label="قصص الأشخاص" role="list">
          <button type="button" onClick={() => setComposerOpen(true)} className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="إنشاء ستوري شخصية">
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary/50 bg-primary/5"><Plus className="h-5 w-5 text-primary" /></span><span className="max-w-16 truncate text-[11px]">قصتك</span>
          </button>
          {isLoading && Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-2" aria-hidden="true"><div className="h-14 w-14 animate-pulse rounded-full bg-muted" /><div className="h-2 w-10 animate-pulse rounded bg-muted" /></div>)}
          {isError && <div className="flex min-w-48 flex-col justify-center gap-2 rounded-xl bg-muted/50 p-3 text-xs"><span className="text-muted-foreground">تعذّر تحميل القصص.</span><button type="button" onClick={() => void refetch()} className="self-start rounded-lg px-2 py-1 font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">إعادة المحاولة</button></div>}
          {!isLoading && !isError && groups.length === 0 && <p className="flex min-h-16 min-w-44 items-center text-xs leading-5 text-muted-foreground">ما في قصص جديدة حاليًا. أضف أول ستوري أو ارجع لاحقًا.</p>}
          {groups.map((group) => <button key={group.user.id} type="button" onClick={() => setActive(group)} className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`عرض ستوري ${group.user.name}`}><span className={`rounded-full p-[2px] ${group.hasUnseen ? 'bg-gradient-to-tr from-amber-500 via-pink-500 to-violet-600' : 'bg-border'}`}><span className="block rounded-full border-2 border-background"><SafeImage variant="avatar" src={getAvatarUrl(group.user.avatarUrl ?? '', 72)} alt="" width={52} height={52} className="h-[52px] w-[52px] rounded-full object-cover" /></span></span><span className="max-w-16 truncate text-[11px]">{group.user.id === useAuthStore.getState().user?.id ? 'أنت' : group.user.name}</span></button>)}
        </div>
      </section>
      {composerOpen && <StoryComposer onClose={() => setComposerOpen(false)} />}
      {active && <StoryViewer group={active} onClose={() => setActive(null)} />}
    </>
  );
}

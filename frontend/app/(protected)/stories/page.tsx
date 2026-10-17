'use client';

import { useState } from 'react';
import { Plus, RotateCw, Sparkles } from 'lucide-react';
import { useStoryFeed } from '@/hooks/queries/useStories';
import { StoryComposer } from '@/components/stories/StoryComposer';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { getAvatarUrl } from '@/lib/cloudinary';
import type { StoryGroup } from '@/api/stories.api';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';

export default function StoriesPage() {
  const { data: groups = [], isLoading, isError, refetch, isFetching } = useStoryFeed();
  const [composer, setComposer] = useState(false);
  const [active, setActive] = useState<StoryGroup | null>(null);
  return (
    <main className="container mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" /> لحظات تختفي بعد 24 ساعة</p><h1 className="text-2xl font-bold sm:text-3xl">قصص الأشخاص</h1><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">شارك صورة أو رسالة قصيرة، وشاهد قصص الأشخاص الذين تتابعهم.</p></div>
        <button type="button" onClick={() => setComposer(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto"><Plus className="h-4 w-4" /> أضف ستوري شخصية</button>
      </header>
      {isLoading ? <LoadingGate loading={isLoading} label="جارٍ تحميل القصص" fallback={<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" aria-hidden="true">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="rounded-2xl border border-border p-3"><div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-muted sm:h-[72px] sm:w-[72px]" /><div className="mx-auto mt-3 h-3 w-20 animate-pulse rounded bg-muted" /><div className="mx-auto mt-2 h-2 w-12 animate-pulse rounded bg-muted" /></div>)}</div>}>{null}</LoadingGate>
      : isError ? <section className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 py-12 text-center"><p className="font-semibold">ما قدرنا نحمّل القصص</p><p className="mt-1 text-sm text-muted-foreground">تأكد من اتصالك بالإنترنت وحاول مرة ثانية.</p><button type="button" onClick={() => void refetch()} disabled={isFetching} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60"><RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> إعادة المحاولة</button></section>
      : groups.length === 0 ? <section className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/60 px-5 py-12 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="h-7 w-7" /></span><h2 className="mt-4 text-lg font-bold">لسّه ما في قصص</h2><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">ابدأ بقصتك الشخصية، أو ارجع لاحقًا لمشاهدة قصص الأشخاص الذين تتابعهم.</p><button type="button" onClick={() => setComposer(true)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Plus className="h-4 w-4" /> إنشاء ستوري</button></section>
      : <section aria-label="قصص الأشخاص"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">القصص المتاحة</h2><span className="text-xs text-muted-foreground">{groups.length} حساب</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{groups.map((group) => <button key={group.user.id} type="button" onClick={() => setActive(group)} aria-label={`عرض قصص ${group.user.name}، ${group.stories.length} قصة`} className="group min-w-0 rounded-2xl border border-border bg-card p-3 text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className={`mx-auto w-fit rounded-full p-[3px] transition-transform group-hover:scale-105 ${group.hasUnseen ? 'bg-gradient-to-tr from-amber-500 via-pink-500 to-violet-600' : 'bg-border'}`}><SafeImage variant="avatar" src={getAvatarUrl(group.user.avatarUrl ?? '', 96)} alt="" width={72} height={72} className="h-16 w-16 rounded-full border-2 border-background object-cover sm:h-[72px] sm:w-[72px]" /></div><p className="mt-2 truncate text-center text-xs font-semibold sm:text-sm">{group.user.name}</p><p className="mt-1 text-center text-[10px] text-muted-foreground">{group.stories.length} {group.stories.length === 1 ? 'قصة' : 'قصص'}</p></button>)}</div></section>}
      {composer && <StoryComposer onClose={() => setComposer(false)} />}
      {active && <StoryViewer group={active} onClose={() => setActive(null)} />}
    </main>
  );
}

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useStoryFeed } from '@/hooks/queries/useStories';
import { StoryComposer } from '@/components/stories/StoryComposer';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { getAvatarUrl } from '@/lib/cloudinary';
import type { StoryGroup } from '@/api/stories.api';

export default function StoriesPage() {
  const { data: groups = [], isLoading } = useStoryFeed();
  const [composer, setComposer] = useState(false);
  const [active, setActive] = useState<StoryGroup | null>(null);
  return <div className="container mx-auto max-w-4xl px-3 py-5 sm:px-4 sm:py-8"><div className="mb-5"><h1 className="text-2xl font-bold">القصص</h1><p className="mt-1 text-sm text-muted-foreground">قصص الأشخاص الذين تتابعهم، متاحة لمدة 24 ساعة.</p></div><button onClick={() => setComposer(true)} className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-start hover:bg-primary/10"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="h-5 w-5" /></span><span><span className="block font-semibold">أضف ستوري</span><span className="text-xs text-muted-foreground">صورة أو رسالة قصيرة</span></span></button>{isLoading ? <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{Array.from({length:5}).map((_,i)=><div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}</div> : <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{groups.map((group) => <button key={group.user.id} onClick={() => setActive(group)} className="overflow-hidden rounded-2xl border border-border bg-card p-3 text-start shadow-sm hover:-translate-y-0.5 hover:shadow-md"><div className={`mx-auto w-fit rounded-full p-[3px] ${group.hasUnseen ? 'bg-gradient-to-tr from-amber-500 via-pink-500 to-violet-600' : 'bg-border'}`}><SafeImage variant="avatar" src={getAvatarUrl(group.user.avatarUrl ?? '', 96)} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-full border-2 border-background object-cover" /></div><p className="mt-2 truncate text-center text-xs font-semibold">{group.user.name}</p><p className="text-center text-[10px] text-muted-foreground">{group.stories.length} قصة</p></button>)}</div>}{composer && <StoryComposer onClose={() => setComposer(false)} />}{active && <StoryViewer group={active} onClose={() => setActive(null)} />}</div>;
}

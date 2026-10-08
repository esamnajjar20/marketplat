'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateStory } from '@/hooks/mutations/useStoryMutations';
import type { StoryVisibility } from '@/api/stories.api';

const backgrounds = [
  { id: 'from-slate-900 via-indigo-900 to-slate-800', label: 'ليلي' },
  { id: 'from-emerald-700 via-teal-600 to-cyan-700', label: 'طبيعة' },
  { id: 'from-rose-700 via-pink-600 to-orange-500', label: 'دافئ' },
  { id: 'from-violet-700 via-fuchsia-600 to-rose-500', label: 'حيوي' },
];

export function StoryComposer({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [background, setBackground] = useState(backgrounds[0]?.id ?? '');
  const [visibility, setVisibility] = useState<StoryVisibility>('FOLLOWERS');
  const createStory = useCreateStory();

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(next: File | undefined) {
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
      toast.error('اختر صورة JPG أو PNG أو WEBP');
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن يكون أقل من 5MB');
      return;
    }
    setFile(next);
  }

  const canPublish = Boolean(file || text.trim());

  async function submit() {
    if (!canPublish || createStory.isPending) return;
    await createStory.mutateAsync({ file, text: text.trim() || undefined, background, visibility });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="إنشاء ستوري">
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div><h2 className="font-bold">ستوري جديدة</h2><p className="text-xs text-muted-foreground">تختفي تلقائيًا بعد 24 ساعة</p></div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto p-4">
          <div className={`relative mx-auto flex aspect-[9/14] w-full max-w-[300px] items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br ${background}`}>
            {preview && <img src={preview} alt="معاينة الستوري" className="absolute inset-0 h-full w-full object-cover" />}
            {!preview && <div className="px-7 text-center text-2xl font-bold leading-relaxed text-white drop-shadow-lg">{text || 'اكتب شيئًا رائعًا...'}</div>}
            {preview && text && <div className="absolute inset-x-4 bottom-5 rounded-2xl bg-black/45 px-4 py-3 text-center text-lg font-semibold text-white backdrop-blur-sm">{text}</div>}
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium hover:bg-muted">
              <ImagePlus className="h-4 w-4" /> {file ? 'تغيير الصورة' : 'إضافة صورة'}
            </button>
            <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pickFile(e.target.files?.[0])} />
            {file && <button type="button" onClick={() => setFile(undefined)} className="rounded-xl border border-border px-3 hover:bg-muted" aria-label="إزالة الصورة"><X className="h-4 w-4" /></button>}
          </div>

          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={3} maxLength={500} placeholder="اكتب رسالة قصيرة..." className="mt-3 w-full resize-none rounded-xl border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="mt-1 text-end text-[11px] text-muted-foreground">{text.length}/500</div>

          {!file && <div className="mt-3"><p className="mb-2 text-xs font-semibold">الخلفية</p><div className="flex gap-2">{backgrounds.map((item) => <button key={item.id} type="button" title={item.label} onClick={() => setBackground(item.id)} className={`h-9 w-9 rounded-full bg-gradient-to-br ${item.id} ring-offset-2 ${background === item.id ? 'ring-2 ring-primary' : ''}`} />)}</div></div>}

          <div className="mt-4"><p className="mb-2 text-xs font-semibold">من يمكنه رؤيتها؟</p><div className="grid grid-cols-2 gap-2">{(['FOLLOWERS', 'PUBLIC'] as StoryVisibility[]).map((value) => <button key={value} type="button" onClick={() => setVisibility(value)} className={`rounded-xl border px-3 py-2 text-sm ${visibility === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>{value === 'FOLLOWERS' ? 'المتابعون فقط' : 'الجميع'}</button>)}</div></div>
        </div>

        <div className="border-t border-border p-3"><button disabled={!canPublish || createStory.isPending} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{createStory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} نشر الستوري</button></div>
      </div>
    </div>
  );
}

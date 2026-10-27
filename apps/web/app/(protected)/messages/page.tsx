/** Desktop inbox landing pane shown until a conversation is selected. */
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquare,
  ShieldCheck,
  Zap,
  Image as ImageIcon,
  Search,
  Wifi,
  ArrowUpLeft,
  Store,
  Handshake,
} from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/shared/ui/Button';

export const metadata: Metadata = buildMetadata({ title: 'الرسائل', noIndex: true });

export default function MessagesPage() {
  return (
    <div className="hidden h-full min-h-0 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.08),_transparent_55%)] p-6 lg:flex xl:p-10">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-7 py-8">
        <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/90 p-7 shadow-sm backdrop-blur-sm xl:p-10">
          <div className="pointer-events-none absolute -end-12 -top-12 h-44 w-44 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-col items-center text-center">
            <div className="mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.4rem] bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <MessageSquare className="h-9 w-9" aria-hidden />
            </div>
            <p className="mb-2 text-xs font-bold tracking-wide text-primary">مركز التواصل في MarketPlat</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground xl:text-3xl">كل تفاوضك ومتابعتك في مكان واحد</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground xl:text-base">
              اختر محادثة من القائمة لعرض الرسائل والملفات ومتابعة الردود. يمكنك التواصل بشأن الإعلانات والخدمات والمنتجات والمتاجر دون مغادرة المنصة.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild className="min-h-11 rounded-xl gap-2">
                <Link prefetch={false} href={`${ROUTES.search}?type=ads`}>
                  <Search className="h-4 w-4" aria-hidden /> استكشف الإعلانات
                  <ArrowUpLeft className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11 rounded-xl gap-2">
                <Link prefetch={false} href={`${ROUTES.search}?type=services`}>
                  <Handshake className="h-4 w-4" aria-hidden /> استكشف الخدمات
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section aria-label="ميزات الرسائل" className="grid grid-cols-2 gap-3 xl:gap-4">
          <article className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card/80 p-4 xl:p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Zap className="h-5 w-5" aria-hidden /></span>
            <div>
              <h2 className="text-sm font-bold text-foreground">تواصل أسرع</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">رسائل مباشرة ومؤشر كتابة وتحديثات لحظية عند توفر الاتصال.</p>
            </div>
          </article>
          <article className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card/80 p-4 xl:p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><ImageIcon className="h-5 w-5" aria-hidden /></span>
            <div>
              <h2 className="text-sm font-bold text-foreground">الصور والملفات</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">راجع الوسائط المرسلة في المحادثة من مكان واحد.</p>
            </div>
          </article>
          <article className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card/80 p-4 xl:p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Wifi className="h-5 w-5" aria-hidden /></span>
            <div>
              <h2 className="text-sm font-bold text-foreground">مراعاة الاتصال الضعيف</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">تُحفظ المسودات والرسائل المعلّقة محليًا لمحاولة إرسالها عند عودة الشبكة.</p>
            </div>
          </article>
          <article className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card/80 p-4 xl:p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
            <div>
              <h2 className="text-sm font-bold text-foreground">تفاوض أكثر أمانًا</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">ثبّت المحادثات المهمة، وأرشف غير النشطة، واحظر الحسابات المزعجة عند الحاجة.</p>
            </div>
          </article>
        </section>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Store className="h-4 w-4" aria-hidden />
          <span>نصيحة: استخدم البحث في قائمة المحادثات للوصول بسرعة إلى الشخص أو الإعلان.</span>
        </div>
      </div>
    </div>
  );
}

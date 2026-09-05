# صفحة اختيارية: `frontend/app/(public)/sellers/ranking/page.tsx`

```tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellersRankingList } from '@/components/sellers/SellersRankingList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'أفضل البائعين' });

export default function SellersRankingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-bold">أفضل البائعين</h1>
        <p className="text-sm text-muted-foreground">
          الترتيب يعتمد على التقييم، الثقة، سرعة الرد، ونشاط الحساب — وليس عدد الإعلانات فقط.
        </p>
      </div>
      <Suspense>
        <SellersRankingList limit={30} />
      </Suspense>
    </div>
  );
}
```

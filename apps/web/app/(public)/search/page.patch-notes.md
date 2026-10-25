# دمج Pull-to-refresh في صفحة البحث

في `app/(public)/search/page.tsx` داخل القسم الذي يعرض النتائج:

```tsx
import { SearchPullToRefresh } from '@/components/search/SearchPullToRefresh';

// ...
<section id="search-results-panel" ...>
  <Suspense fallback={...}>
    <SearchPullToRefresh>
      <SearchResults />
    </SearchPullToRefresh>
  </Suspense>
</section>
```

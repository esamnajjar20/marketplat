# MarketPlat — تحسين النت البطيء (المراحل 1–5)

## المرحلة 1
- keepPreviousData للقوائم
- skeletons / loading.tsx
- staleTime/gcTime أعلى

## المرحلة 2
- رئيسية: LazySection + whenIdle
- prefetch عند hover (بطاقات)
- priority للصورة الأولى فقط في التفاصيل
- refetchOnMount ذكي

## المرحلة 3
- صور قائمة 320px + sizes
- خطوط مؤجلة (DeferredFonts)
- dynamic لـ Capacitor و Admin Analytics

## المرحلة 4
- SW timeout 3s + CACHE_VERSION v25
- ListDataStatus (كاش/تحديث)
- offline lists: منتجات/خدمات/متاجر/تصنيفات

## المرحلة 5
- List select بدون description
- Cache-Control للقوائم العامة

بعد الدمج: أعد بناء الفرونت والباك، وتأكد من تحديث الـ Service Worker عند المستخدمين.

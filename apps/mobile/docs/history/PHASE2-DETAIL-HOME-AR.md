# المرحلة 2 — توحيد التفاصيل وتهذيب الرئيسية

## ما تم تنفيذه

### 1. مكوّن `DetailScaffold` (في MobileUI)
غلاف موحّد لشاشات التفاصيل:
- `AppHeader` (رجوع + عنوان + actions)
- حالات `LoadingState` / `ErrorState`
- محتوى قابل للتمرير
- **شريط CTA سفلي ثابت** (`footer`) للإجراء الرئيسي

### 2. شاشات التفاصيل — هيكل واحد

| الشاشة | الهيكل |
|--------|--------|
| `app/ads/[id].tsx` | صور → بطاقة سعر/عنوان → وصف → بائع → CTA: مراسلة البائع |
| `app/products/[id].tsx` | صور → بطاقة منتج → مراسلة/إبلاغ → CTA: اطلب الآن |
| `app/services/[id].tsx` | صور → بطاقة خدمة → وصف → CTA: اطلب هذه الخدمة |

المشترك:
- `SectionCard` + `Badge` + `PrimaryButton` / `SecondaryButton`
- حالات التحميل/الخطأ من النظام الموحد
- الحفاظ على كل منطق المفضلة والمحادثة والكاش

### 3. الصفحة الرئيسية
- استبدال ألوان hex الثابتة بـ `colors.*` من الـ tokens
- حالات الإعلانات: `LoadingState` / `ErrorState` / `EmptyState`
- `SectionHeader` فوق قائمة الإعلانات
- أقسام السوق (`HomeMarketplaceSections`) تستخدم `SectionHeader` المشترك

## الملفات
| الملف | التغيير |
|-------|---------|
| `src/components/MobileUI.tsx` | + `DetailScaffold` |
| `app/ads/[id].tsx` | إعادة هيكلة بصرية |
| `app/products/[id].tsx` | إعادة كتابة نظيفة موحّدة |
| `app/services/[id].tsx` | إعادة كتابة نظيفة موحّدة |
| `app/index.tsx` | tokens + حالات موحّدة |
| `src/features/discovery/HomeMarketplaceSections.tsx` | SectionHeader مشترك |

## ملاحظة
منطق الأعمال (كاش، مفضلة، outbox، طلبات) لم يُمس — التغيير بصري وهيكلي فقط.

## المرحلة التالية المقترحة
1. توحيد قوائم الاكتشاف (`products`, `services`, `stores`, `requests`) بنفس بطاقات الحالات.
2. تهذيب شاشة الإضافة والمحررات بخطوات واضحة.
3. صقل بطاقات الإعلان في الرئيسية (`AdCard` مكوّن مشترك).

# إعادة هيكلة UI/UX للموبايل — نوفمبر 2026

## الهدف
رفع الإحساس الاحترافي للنسخة الموبايل لتقترب من جودة الويب، مع الاستفادة القصوى من Design System الموجود دون كسر الهوية.

## ما تم تنفيذه

### 1) Design Tokens (`src/theme/tokens.ts`)
- **تخفيف أوزان الخط**: من 800/900 إلى 600/700 في معظم المستويات → واجهة أهدأ وأقل «صخباً».
- **مقياس تايبو أوضح**: display / title / subtitle / body / caption بمسافات line-height أفضل.
- **elevation.lg** جديد للعناصر المرتفعة.
- **radius.card = 16** وموحّد أكثر.
- **sizes** موسّعة: `cardImageRow`, `cardImageGrid`, `adImageWidth` لنسب بطاقات ثابتة.
- **bottomNavHeight** و**buttonHeight** مضبوطان قليلاً.

### 2) بطاقات السوق (`MarketCards.tsx` + `ProductCard.tsx`)
- نسب صور أوضح وثابتة.
- ظل `elevation.sm` أقوى قليلاً.
- تايبو أهدأ داخل البطاقة.
- شارة خصم في ProductCard عند وجود discount.
- زر المفضلة دائري أنظف.
- مسافات داخلية متناسقة.

### 3) أنماط الواجهة المشتركة (`ui/styles.ts`)
- زيادة `gap` في المحتوى الرئيسي (`spacing.xl`) لتنفس أفضل.
- `paddingBottom` أكبر لاستيعاب الشريط السفلي.
- بطاقات تستخدم `radius.card`.
- أيقونات صفوف القائمة بحجم أوضح ووزن أقل.

### 4) شاشة الحساب (`app/account.tsx`) — إعادة هيكلة كاملة
- **بطاقة ملف شخصي** في الأعلى (أفاتار + اسم + إيميل).
- **شبكة اختصارات سريعة** (6 وجهات يومية) بدل قائمة طويلة فورية.
- بقية الوجهات خلف زر «عرض كل وجهات الحساب» (طيّ/فتح).
- منطق صلاحيات المتجر/مقدم الخدمة محفوظ كما كان.

### 5) الشريط السفلي (`BottomNavigation.tsx`)
- زر **إضافة** أصبح بارزاً بلون brand وصلب (أيقونة بيضاء).
- حالة التبويب النشط أوضح.
- أوزان تسميات أخف.
- استخدام `ux.pressedOpacity` الموحّد.

## الملفات المعدّلة
```
apps/mobile/src/theme/tokens.ts
apps/mobile/src/components/MarketCards.tsx
apps/mobile/src/components/ui/ProductCard.tsx
apps/mobile/src/components/ui/styles.ts
apps/mobile/src/components/BottomNavigation.tsx
apps/mobile/app/account.tsx
```

## ما لم يُمس (عمداً)
- منطق البيانات والـ hooks (useHomeAds, Auth, offline…).
- سياسة التنقل والإخفاء.
- الشاشات التفصيلية (يمكن ترقيتها لاحقاً بنفس التوكنز).

## الخطوات التالية المقترحة
1. مراجعة بصرية على جهاز حقيقي (RTL + أحجام خطوط النظام).
2. توحيد بطاقات الرئيسية الأفقية (HomeMarketplaceSections) مع نفس نسب `sizes.cardImage*`.
3. Skeleton متحرك (Animated opacity pulse).
4. تخفيف كثافة أقسام الرئيسية (طيّ أقسام المجتمع خلف «المزيد»).
5. مراجعة تباين brandSoft على أجهزة OLED.

## التحقق
- لا يوجد hex خام جديد خارج tokens.
- المكوّنات ما زالت تستورد من `@/theme/tokens` و`@/components/ui`.
- التوافق مع RTL وaccessibility محفوظ.

## المرحلة 2 — الرئيسية والأقسام (مكتملة)

### HomeMarketplaceSections
- MiniCard موحّد بالكامل عبر StyleSheet + tokens (نسب صورة، ظل، تايبو).
- مسافات أقسام xxl بدل تكديس.
- CTA الطلبات بنفس لغة التصميم الجديدة.

### HomeCommunitySections
- تخفيف أوزان الخط.
- بطاقات المتاجر بـ radius.card + elevation.sm ونسب صورة من tokens.

### الصفحة الرئيسية (app/index.tsx)
- زيادة gap العام إلى xxl.
- padding سفلي أكبر.
- أوزان خط محلية مخفّفة مسبقاً.

### حزمة التسليم
`artifacts/mobile-ui-ux-improvements.zip` تحتوي كل الملفات المعدّلة.

## المرحلة 3 — التفاصيل + Skeleton + طي المجتمع (مكتملة)

### Skeleton متحرك
- `SkeletonBlock` يستخدم `Animated` pulse (opacity 0.4 ↔ 1)
- `SkeletonCard` / `SkeletonList` بنفس النبض

### شاشات التفاصيل
- تخفيف أوزان الخط في إعلان/منتج
- تسلسل أوضح للسعر والعنوان
- padding أقوى (`lg` / `detailContent`)
- `MediaGallery`: ارتفاع 300 وزوايا أوضح

### طي أقسام المجتمع
- افتراضياً: حتى 4 متاجر فقط
- القصص تظهر بعد الضغط على «المزيد من المجتمع»
- زر طي/فتح في الأسفل

### ملفات إضافية في الحزمة
```
src/components/ui/Feedback.tsx
src/components/ui/MediaGallery.tsx
src/components/ui/DetailScaffold.tsx
app/ads/[id].tsx
app/products/[id].tsx
```

# خطة شاملة لتحسين تجربة المستخدم وواجهة الويب — سوق غزة

**تاريخ:** 2026-11-21  
**الحالة:** قيد التنفيذ  
**المصدر:** تقرير UX/UI الشامل + تنفيذ مباشر

---

## المبادئ الحاكمة

1. **لا كسر للـ Hydration** — أي تغيير في client components يحافظ على mounted gates.
2. **الحفاظ على Design Tokens** — التعديلات تمر عبر `globals.css` و `cardTokens.ts`.
3. **Mobile-first + RTL** — كل تحسين يُختبر ذهنياً على 360–430px.
4. **أداء** — لا زيادة في JS initial bundle بدون مبرر قوي.
5. **قابلية التراجع** — كل تغيير صغير وواضح.

---

## المراحل والأولويات

### المرحلة 0 — الأساس (Design Tokens + Cards)  ← **قيد التنفيذ الآن**
| # | التحسين | الملف | الحالة |
|---|---------|-------|--------|
| 0.1 | توحيد وتقوية feedback البصري للبطاقات (hover/press/active) | `cardTokens.ts` | جاري |
| 0.2 | تليين ألوان الفئات (cat-*) لتبقى دافئة ومتسقة مع البراند | `globals.css` | جاري |
| 0.3 | إضافة utility لسعر غير معلن أوضح | `cardTokens.ts` | جاري |
| 0.4 | توحيد shadow-card-hover إن لم يكن موجوداً | `globals.css` / Tailwind | جاري |

### المرحلة 1 — كثافة الصفحة الرئيسية واكتشاف المحتوى
| # | التحسين | الملف | الحالة |
|---|---------|-------|--------|
| 1.1 | تحسين المسافات والترتيب البصري في HomePageContent | `HomePageContent.tsx` | معلق |
| 1.2 | إضافة type shortcuts خفيفة تحت الـ Hero بدون تكرار Search | `EagerHomeSections` + `HomeTypeShortcuts` | ✅ تم |
| 1.3 | جعل بعض الأقسام البعيدة (Nearby) أقل إلحاحاً أو قابلة للطي | HomePageContent spacing | ✅ تم (مسافات) |
| 1.4 | تحسين SectionHeader (وضوح الـ CTA) | `SectionHeader.tsx` | معلق |

### المرحلة 2 — صفحات التفاصيل (CTAs + ترتيب المعلومات)
| # | التحسين | الملف | الحالة |
|---|---------|-------|--------|
| 2.1 | sticky action bar للتواصل/الشراء في الموبايل | detailTokens + Ad/Product/Service sticky | ✅ موجود + تحسين |
| 2.2 | رفع السعر + الحالة + الموقع فوق الطي | sticky CTA + existing layout | ✅ موجود |
| 2.3 | empty state واضح لقسم "مشابهة" | EmptyState shared | ✅ polish |

### المرحلة 3 — Empty States + Micro-interactions
| # | التحسين | الملف | الحالة |
|---|---------|-------|--------|
| 3.1 | توحيد Empty states في البحث والـ rails والمفضلة | `EmptyState.tsx` | ✅ polish |
| 3.2 | feedback بصري عند إضافة للمفضلة (scale + toast) | FavoriteButton | ✅ تم |
| 3.3 | تحسين skeleton → content transition | existing + TypeShortcuts skeletons | ✅ جزئي |

### المرحلة 4 — التنقل والاكتشاف
| # | التحسين | الملف | الحالة |
|---|---------|-------|--------|
| 4.1 | تلميح بصري أو وصف أفضل في CreateSheet | `CreateSheet.tsx` | معلق |
| 4.2 | جعل "بحث شامل" أبرز داخل ExploreSheet | `ExploreSheet.tsx` | معلق |
| 4.3 | long-press على زر + أو استكشاف (اختياري) | BottomNav | مؤجل (اختياري) |

### المرحلة 5 — الاتساق والنماذج وDark mode
| # | التحسين | الملف | الحالة |
|---|---------|-------|--------|
| 5.1 | فرض `--control-height` و `--touch-target` على الأزرار والمدخلات | Button / Input | ✅ موجود مسبقاً |
| 5.2 | مراجعة contrast الـ badges الصغيرة في Dark mode | globals.css | ✅ تم |
| 5.3 | توثيق سريع للـ Design System | UX_IMPROVEMENT_PLAN_AR.md | ✅ تم |

---

## ترتيب التنفيذ الفعلي (هذا الأسبوع)

1. **اليوم:** المرحلة 0 كاملة + جزء من المرحلة 1 (مسافات + SectionHeader).
2. **غداً:** المرحلة 1.2 + 4.1 + 4.2.
3. **بعدها:** المرحلة 2 (يحتاج فحص detail pages أكثر).
4. **آخر الأسبوع:** المرحلة 3 + 5.

---

## مقاييس النجاح

- انخفاض الإحساس بـ "الصفحة طويلة جداً" في الـ Home.
- بطاقات متسقة بصرياً في كل أنواع المحتوى.
- أزرار التواصل واضحة وسهلة الوصول في التفاصيل.
- Empty states مفيدة وليست فارغة.
- لا انحدار في Lighthouse / Hydration / Bundle size.


---

## PERF-LOAD-01 — تحسين أداء التحميل (2026-11-21)

### التغييرات

1. **LazySection**
   - prop جديد `priority`: rootMargin أوسع + بدون انتظار idle.
   - timeout الـ idle من 2500ms → 1200ms (أو 280ms بدون rIC).
   - `content-visibility: auto` على الـ slots قبل mount لتقليل كلفة الرسم.

2. **HomePageContent**
   - ForYou + Following = `priority`.
   - باقي الأقسام = `whenIdle` مع rootMargin متدرج.
   - `useWarmHomeChunks`: تحميل مسبق لـ JS chunks أثناء idle بعد أول رسم (بدون طلبات API إضافية).

3. **HomeSectionFallback**
   - `content-visibility` + `containIntrinsicSize` لتقليل paint للكائنات خارج الشاشة.

### الأثر المتوقع
- ظهور أسرع لأول rails عند التمرير.
- أقل ضغط على الـ main thread عند فتح الصفحة.
- انتقال أنعم بين skeleton والمحتوى عند التمرير السريع.

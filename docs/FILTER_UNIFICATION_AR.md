# توحيد نظام الفلاتر في MarketPlat

## مصدر الحقيقة

`shared/filters/index.ts` هو المصدر المشترك الوحيد لقواعد الفلاتر المحايدة عن إطار العمل والمنصة. يحتوي على:

- `FILTER_PROFILES`: تعريف معاملات الفلاتر المسموح بها لكل صفحة، ومفاتيح الاستعلام المقبولة (`params`)، وقيم الفرز الافتراضية والمجموعات التي تُحسب كفلتر واحد.
- `buildFilterParams`: تسلسل معاملات API وروابط البحث مع قاعدة موحّدة للقيم الفارغة والمسافات والأرقام. عند تمرير `profile` يرفض المحرك تلقائياً أي مفتاح غير موجود في عقد الصفحة، مع السماح دائماً بـ `page` و`limit` وبمفاتيح إضافية معلنة صراحةً عبر `extraKeys`.
- `updateFilterParams` و`removeFilterParams` و`clearFilterParams`: تحديث الفلاتر وإزالتها مع المحافظة على معاملات السياق غير المرتبطة وإعادة الصفحة الأولى افتراضياً.
- `countConfiguredFilters`: احتساب عدد الفلاتر النشطة، بما في ذلك مجموعات السعر والموقع.
- `normalizeFilterPage` و`parseFilterEnum`: التحقق المشترك من أرقام الصفحات والقيم المحددة القادمة من الرابط.

## طبقة الويب

`frontend/hooks/useUnifiedFilters.ts` هو محوّل Next.js إلى المحرك المشترك. يجب أن تستخدمه صفحات القوائم لتحديث الرابط، مسح الفلاتر، تحديث الحقول المؤجل، وقراءة عدد الفلاتر. مكونات `frontend/components/shared/filters/` هي عناصر العرض المشتركة للحقول والشرائح واللوحات ونافذة الهاتف.

الصفحات المرتبطة بملفات التعريف تشمل الإعلانات والمنتجات والخدمات والمتاجر والبحث والطلبات والمفضلة والقوائم الشخصية والمخزون والمواعيد وجداول الإدارة، بما فيها جداول البائعين والمنتجات والخدمات والطلبات الإدارية التي تستخدم `AdminFilterBar`. الحقول الديناميكية الخاصة بنوع الخدمة أو نوع التقرير تبقى معرفة عند الصفحة، لكن قواعد تحديث الرابط والتسلسل والعد تستخدم المحرك نفسه.

## طبقة الهاتف وواجهات API

تستورد واجهات API في Expo `buildFilterParams` من `shared/filters` مع تمرير ملف التعريف الخاص بكل قائمة؛ وبذلك تخضع المفاتيح المرسلة إلى allow-list مركزية مشتركة مع الويب. يمكن للواجهات الأصلية الاحتفاظ بعناصر عرض مناسبة لنظام التشغيل، لكن لا تنشئ قواعد مختلفة لتطبيع القيم أو تسلسلها.

## قواعد إضافة صفحة جديدة

1. أضف ملف تعريف للصفحة داخل `FILTER_PROFILES` ولا تنسخ قائمة مفاتيح الفلاتر داخل الواجهة.
2. استخدم `useUnifiedFilters({ profile })` في واجهة الويب، أو دوال المحرك مباشرة في سياق غير React.
3. استخدم `buildFilterParams` في API على الويب أو الهاتف، وأضف معاملات pagination إلى الكائن نفسه عند الحاجة.
4. عرّف القيم المسموحة للـ enums في نوع الصفحة أو schema، واستخدم `parseFilterEnum` عند قراءة الرابط.
5. أضف اختباراً للملف التعريفي، للقيم الافتراضية، ولتأثير تغيير الفلتر على الصفحة والرابط.

## حدود التوحيد

لا تدخل في ملفات التعريف معاملات التنقل البحتة مثل `tab` أو `view` أو إشارات الواجهة المؤقتة مثل `focus` و`published`، إلا عندما تكون مطلوبة للسياق أو المحافظة عليها أثناء تغيير فلتر. لا تعتبر فلاتر عرض محلية بحتة (لا تؤثر على الرابط أو API) جزءاً من عقد فلاتر البيانات.


## Follow-up coverage added

- The canonical `shared/filters/index.ts` profiles now include provider dashboard, customer lists, and the complete listing contracts for search, sales cost products, notifications, orders, admin tables, service providers, requests, favorites, and appointments.
- Frontend list API adapters serialize filters through `buildFilterParams` with an explicit profile. Unknown API query keys are dropped instead of silently leaking to the backend.
- The shared App Router hook uses the same profile for URL allow-lists, active counts, update/reset behavior, and context-only URL state.
- Header search, global search, suggestions, customer list/search, provider dashboard, and sales cost-products were also connected to the shared contracts.
- UI-only context keys such as global-search `focus` remain in the URL where needed but are excluded from API query serialization.

The profiles intentionally differ by page: unification means one implementation and one source of truth for behavior and contracts, not forcing ads, products, services, and admin tables to expose identical filters.

- Mobile paginated listings now use the same profiles for appointments, favorites, marketplace/service requests, owned service listings, profile ads/follow lists, blocked users, reports, seller/service reviews, followed stores and store members.
- The desktop service-request API adapter uses the same customer/provider status contracts.

- أضيفت تغطية إضافية لواجهات الموبايل: جلب إعلاناتي وترتيب البائعين يمر الآن عبر ملف تعريف مركزي، كما أصبحت معاملات صفحات الحساب العامة تُطبّع عبر `normalizeFilterPage`.
- ملفات تعريف إضافية تغطي قوائم المتابعة والتوصيات ومطابقات الخدمات ولوحات المبيعات والعملاء، حتى لا تنشأ قوائم سماح موازية عند إضافة استدعاء قائمة جديد.
- معاملات المحادثات ذات المؤشر `before/cursor` بقيت خارج عقود الفلاتر لأنها آلية ترقيم زمني للرسائل وليست فلترة قوائم المحتوى.

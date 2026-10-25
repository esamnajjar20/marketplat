# Marketplat — توحيد البطاقات، المرحلة السادسة

## النطاق
توحيد هياكل التحميل (Skeleton) مع رموز التصميم المشتركة حتى لا تختلف الحواف والحشوات ونسب الصور عن البطاقات الفعلية.

## التغييرات
- إضافة `CARD_SKELETON_SHELL` و`CARD_SKELETON_MEDIA` و`CARD_SKELETON_BODY` و`CARD_SKELETON_BODY_COMPACT` إلى `apps/web/components/shared/cards/cardTokens.ts`.
- تحديث `AdCardSkeleton` و`ProductCardSkeleton` و`ServiceListingCardSkeleton` لاستخدام الغلاف ونسبة الصورة والحشوات المشتركة.
- تحديث `StoreCardSkeleton` لاستخدام غلاف البطاقة المشترك، وتقليل الحشوة وحجم الأفاتار على الهاتف مع الإبقاء على المقاسات الأكبر للشاشات الأوسع.

## التحقق والحدود
- فحص يدوي للفروقات والتأكد من وجود التعديلات في الملفات الأربعة ورموز التصميم.
- لم يتم تشغيل TypeScript أو ESLint أو Vitest أو `next build`؛ الاعتماديات غير مثبتة في بيئة العمل.
- لم يتم إجراء اختبار بصري داخل متصفح، لذلك لا ندعي تطابقًا بصريًا نهائيًا.

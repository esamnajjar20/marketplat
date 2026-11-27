# تحديث توحيد Validation في MarketPlat

## ما تغير

- أصبح `packages/contracts` المصدر المركزي لمخططات Zod وقواعد الإدخال المشتركة.
- توحيد سياسة كلمة المرور ورسائلها، والبريد، والاسم، والهاتف، والأرقام المالية، والإحداثيات، والتحويلات الشائعة.
- توحيد مخططات تسجيل الدخول والتسجيل وحقول نماذج الإعلانات والمنتجات والخدمات والبحث/الأسعار وطلب الخدمة.
- توحيد تحويل الأرقام وقيم Boolean في Query String وFormData مع دعم `true/false` و`1/0` في الاستعلامات ورفض القيم غير المعروفة بدلاً من تحويلها تلقائياً إلى `false`.
- API يستورد سياسة كلمة المرور وحقول التسجيل والتحقق من حقول الطلب من الحزمة المشتركة.
- دالة ترقيم الصفحات وتحويل Query Number في API أصبحت واجهات إعادة تصدير للعقد المشترك.
- Mobile يعيد تصدير مخططات النماذج من الحزمة المشتركة، ويستخدم Schema موحداً لبيانات pagination.
- Web يستخدم مخططات الدخول والتسجيل والطلب من المصدر نفسه.
- الملفات القديمة أصبحت طبقات توافق رفيعة، وليست أماكن لإضافة قواعد جديدة.

## بعد فك الحزمة

```bash
pnpm install
npm --prefix frontend install
pnpm --filter @marketplat/contracts build
pnpm --filter @marketplat/contracts type-check
pnpm --filter @marketplat/contracts test
pnpm --filter classifieds-platform-backend test -- --runInBand
npm --prefix frontend run type-check
npm --prefix frontend run test
pnpm --filter @marketplat/mobile type-check
pnpm --filter @marketplat/mobile test
```

ملاحظة: فحوصات المشروع الكاملة لم تعمل في بيئة تجهيز الحزمة لعدم وجود `node_modules`؛ تم تنفيذ فحص الصياغة لكل ملفات TypeScript/TSX ذات الصلة، ويجب إكمال أوامر التحقق أعلاه بعد تثبيت الاعتماديات.

- نماذج إنشاء الإعلان والمنتج والخدمة في الويب أصبحت تستدعي مخططات الحقول الأساسية من `packages/contracts`؛ التحقق من الصور والحقول الديناميكية يظل في الواجهة والخادم حسب سياق المجال.
- إزالة التحويل المحلي المكرر لأرقام الاستعلام من وحدة مكافحة الاحتيال، وتوحيد Boolean وEmail العملاء في المصدر المشترك.

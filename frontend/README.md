# جميع تحسينات UI/UX (المراحل 1–5)

انسخ محتويات `components/` و `lib/` و `hooks/` و `app/` إلى مشروع `frontend` مع الحفاظ على نفس المسارات.

## ملخص المراحل

| مرحلة | أبرز ما فيها |
|-------|----------------|
| 1 | شريط تواصل ثابت، مفضلة 44px، BottomNav أكبر |
| 2 | رئيسية أخف، معرض بالسحب، مسح فلاتر |
| 3 | نشر إعلان بـ 3 خطوات، مشابهة أفقية، onboarding |
| 4 | سجل بحث أخير، Lightbox للصور |
| 5 | العودة للأعلى، تمييز «تم البيع»، عرض المزيد في البحث |

## دمج سريع

```bash
cp -r components/* frontend/components/
cp -r lib/*         frontend/lib/
cp -r hooks/*       frontend/hooks/
cp app/\(public\)/layout.tsx frontend/app/\(public\)/layout.tsx
```

ثم راجع البناء: `npm run type-check` داخل frontend.

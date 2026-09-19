# إصلاح الأوفلاين + ردود الفعل (OFFLINE-DRAFT-PUBLISH-01 + UX-01)

## ماذا يصلح؟
1. حفظ المسودة مع الصور الأصلية عند النشر بدون نت (إعلان / منتج / خدمة / طلب).
2. رفع تلقائي مؤكد عند عودة النت (حتى لو Service Worker لم يعترض الطلب).
3. ردود فعل واضحة للمستخدم: توست مع شرح + زر «مركز المزامنة».

## تجربة المستخدم
| الحدث | الرسالة |
|--------|---------|
| نشر أوفلاين | «الإعلان/المنتج/… محفوظ محليًا — لم يُنشر بعد» + زر مركز المزامنة |
| فشل شبكة وأونلاين | «تعذّر الإرسال — حُفظت نسخة محلية» + توجيه |
| عودة النت ونجح الرفع | «تم رفع العنصر المحفوظ محليًا بنجاح» |
| فشل جزء من الرفع | «رُفع X وفشل Y» + رابط المزامنة |
| زر مزامنة الآن | «جاري المزامنة…» ثم نتيجة واضحة |

## الملفات
### جديدة
- `frontend/lib/offlineDraftPublisher.ts`
- `frontend/lib/offlinePublishFeedback.ts`

### معدّلة
- `frontend/lib/offlineAdDrafts.ts`
- `frontend/lib/offlineQueue.ts`
- `frontend/hooks/mutations/useAdMutations.ts`
- `frontend/hooks/mutations/useProductMutations.ts`
- `frontend/hooks/mutations/useServiceListingMutations.ts`
- `frontend/hooks/mutations/useRequestMutations.ts`
- `frontend/components/pwa/OfflineBootstrap.tsx`
- `frontend/components/settings/SyncCenterClient.tsx`
- `frontend/app/offline/page.tsx`

انسخ محتويات المجلد مع الحفاظ على المسارات تحت `frontend/`.

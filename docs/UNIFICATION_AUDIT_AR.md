# تقرير توحيد الأنظمة غير الموحّدة

## ما تم توحيده (منفّذ في هذه الحزمة)

| النظام | قبل | بعد |
|---|---|---|
| تسميات الحالات في الموبايل | 14 خريطة نصية مكرّرة داخل الشاشات + `statusLabel` عامة بصياغة واحدة لكل النطاقات | سجل واحد `domainLabel(domain, value, fallback)` في `apps/mobile/src/lib/status-labels.ts` |
| تسمية الطلب/العرض في الموبايل | `my-requests` و`my-offers` تعرضان صياغة مختلفة عن شاشة التفاصيل | نفس الصياغة في كل الشاشات |
| حالة البلاغ بين الويب والموبايل | الويب «تم الحل/تم الرفض»، الموبايل «تمت المعالجة/أُغلق البلاغ» | الموبايل يطابق الويب |
| حالة عضو المتجر (ويب) | خريطتان محليتان داخل `MyStoreMembersList` | `STORE_MEMBER_STATUS_*` في `lib/storeStatus.ts` |
| تنسيق الوقت (ويب) | `Intl` مباشر بلغة `ar` أو `ar-PS` بدون `latn` وبمنطقة زمنية الجهاز | `formatHourMinute` و`formatDayMonthTime` و`formatTimestamp` و`formatDateTimeMedium` (غزة + أرقام لاتينية) |
| النسخ للحافظة (ويب) | `navigator.clipboard` مباشر في `AdminMonitoringCenter` | `copyToClipboard` |

## أُضيف في الدفعة الثانية

- `shareText` في `features/sharing/deep-links.ts` بدل `Share.share` المباشر في شاشتي المبيعات والفاتورة.
- `lib/contact-links.ts` (`telUrl`/`whatsappUrl`) بدل بناء `tel:` و`wa.me` يدويًا في `service-providers/[id]`.
- حذف `REVIEWED` من تسميات بلاغات الموبايل (غير موجودة في enum الـ backend).

## لم يُغيَّر عمدًا (يحتاج قرارك)

1. صياغة SOLD: «مباع» (AdCard والموبايل، واختبار AdCard يثبّتها) مقابل «تم البيع» في `STATUS_LABELS`.
2. `AdminRecentActivity` يحتفظ بخريطته المحلية: `AdminAdsTable` يبني خيارات الفلتر من `Object.entries(STATUS_LABELS)`، فإضافة PENDING/REJECTED هناك تغيّر الفلتر.
3. `DownloadStoreCatalogButton` و`AdminNetworkRequestsPanel` و`messageUtils`: تنسيقات خاصة بحالات استخدامها.
4. `FlatList` في `app/index` و`stories` و`messages/[id]`: مقصودة على الأرجح (رأس مخصص، أفقي، مقلوب).
5. نقل رموز الأخطاء والحالات إلى `@marketplat/contracts`: مرحلة منفصلة (الموبايل والويب لا يعتمدان على الحزمة حاليًا).

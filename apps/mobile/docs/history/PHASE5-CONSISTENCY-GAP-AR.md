# المرحلة 5 — إغلاق فجوة الاتساق (المسارات الحرجة)

## الهدف
جعل المسار من فتح التطبيق → دخول → تصفح → تفاصيل → رسائل/طلبات متناسقاً بصرياً.

## ما تم ترحيله
| الشاشة | التحسين |
|--------|---------|
| `login.tsx` | Field + PrimaryButton + Notice + tokens |
| `my-ads.tsx` | AppHeader + SectionCard + حالات موحّدة |
| `notifications.tsx` | AppHeader + Empty/Error/Loading (منطق الوجهات محفوظ) |
| `messages.tsx` | AppHeader + SearchBar + Chip + بطاقات محادثة |
| `orders/[id].tsx` | DetailScaffold + SectionCard + Badge + CTA سفلي |

## الحوكمة
أُضيفت الملفات أعلاه إلى القائمة الصارمة في `verify-design-tokens-no-raw-hex.mjs`.  
النتيجة: ✅ لا hex خام في الملفات المرحّلة · تحذير فقط للباقي (~89).

## ما تبقّى لاحقاً
- `messages/[id]` (المحادثة الفردية)
- `stores/[id]`
- `register` / `ad-editor` تفصيلياً
- أيقونات موحّدة بدل الرموز النصية

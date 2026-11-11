# المرحلة 4 — محادثات + اختصارات الأيقونة

## ما كان موجوداً أصلاً
- تخطيط رسائل: قائمة + نافذة محادثة؛ على الموبايل المحادثة ملء الشاشة
- إخفاء BottomNav أثناء `/messages/[id]` في `(protected)/layout.tsx`
- Deep links: `marketplat://...`

## ما أُضيف

### 1) اختصارات أيقونة Android (long-press)
- `android/.../res/xml/shortcuts.xml` — بحث / نشر / رسائل
- `AndroidManifest.xml` — `android.app.shortcuts`
- نصوص في `strings.xml`

بعد الدمج: `npx cap sync android` ثم أعد بناء الـ APK.

### 2) سحب لتحديث صندوق الوارد
- `ConversationList` ملفوف بـ `PullToRefresh` → `refetch()`

### 3) مظهر محادثة أعمق على Native
- class `native-chat-thread` على جذر `ChatWindow`
- `native-chat-composer` حول `MessageInput` (safe-area)
- CSS في `native-app.css` (مراحل 1–4)

## تحقق
- [ ] ضغط مطوّل على أيقونة التطبيق → بحث، نشر، رسائل
- [ ] اختصار يفتح المسار الصحيح داخل التطبيق
- [ ] سحب صندوق الوارد يحدّث القائمة
- [ ] داخل محادثة: لا شريط سفلي عام؛ حقل الكتابة فوق الـ home indicator

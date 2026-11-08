# المرحلة الخامسة — تجميع بيانات حضور الطرف الآخر في المحادثة

## الهدف

تقليل طلب مستقل عند فتح محادثة محددة. كان `ChatWindow` يستدعي `useConversation(conversationId)` ثم `useUserPresence(partyId)`، ما ينتج طلبين مستقلين: تفاصيل المحادثة و`GET /users/presence?ids=...`.

## التغيير

- أصبح `GET /conversations/:id` يعيد `otherPartyPresence` مع تفاصيل المحادثة.
- ينفّذ الباك إند فحص الحظر وحالة الحضور بالتوازي باستخدام `Promise.all`.
- يستخدم `ChatWindow` حالة الحضور المرفقة مع تفاصيل المحادثة ولا يستدعي hook حضور منفصلًا.
- أضيف الحقل الاختياري إلى نوع `Conversation` للتوافق مع بيانات القائمة/الكاش القديمة.
- لم يتم دمج الرسائل مع تفاصيل المحادثة؛ الرسائل مرقّمة/مجزأة ولها دورة تحديث مستقلة، ودمجها سيزيد حجم الاستجابة ويضعف التحميل التدريجي.
- لم يتم تغيير `usePresence` في قائمة المحادثات؛ القائمة تحتاج حضور عدة أطراف ويستخدم endpoint الدفعي الموجود أصلًا.

## الأمان والأداء

- endpoint تفاصيل المحادثة يتطلب المصادقة ويتحقق من عضوية المستخدم في المحادثة قبل إرجاع البيانات.
- الحضور يُقرأ لمعرّف الطرف الآخر فقط، ولا يُكشف حضور بقية المستخدمين.
- دالة `presence.getPresence` تتعامل مع تعطل Redis وتعيد حالة offline افتراضية؛ لذلك لا ينبغي أن يؤدي فشل خدمة الحضور إلى تعطيل فتح المحادثة.
- لم تُضف استجابة شخصية إلى كاش عام.

## الملفات المعدلة

- `apps/api/src/modules/conversations/conversations.service.ts`
- `apps/api/tests/unit/conversations.service.test.ts`
- `frontend/types/conversation.types.ts`
- `frontend/components/messages/ChatWindow.tsx`
- `frontend/__tests__/components/ChatWindow.test.tsx`

## التحقق

أضيفت/حُدثت اختبارات وحدات لتغطية إرجاع حضور الطرف الآخر، وحالة online/offline في رأس المحادثة. لم تُشغّل Jest/Vitest أو `tsc --noEmit` أو build في هذه البيئة؛ مجلدا `apps/api/node_modules` و`frontend/node_modules` غير موجودين. لذلك يلزم تشغيل الاختبارات والبناء في بيئة المشروع بعد الدمج.

## تحقق Network بعد النشر

عند فتح محادثة جديدة، يُتوقع اختفاء طلب `GET /users/presence?ids=<otherPartyId>` المنفصل من `ChatWindow`، مع بقاء طلب `GET /conversations/:id` وطلب الرسائل. لا تتوقع اختفاء طلب الحضور الدفعي من قائمة المحادثات؛ فهو يخدم عدة صفوف في القائمة.

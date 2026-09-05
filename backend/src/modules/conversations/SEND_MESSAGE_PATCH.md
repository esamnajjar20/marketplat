# دمج حساب سرعة الرد في `conversations.service.ts`

## 1. Import

```ts
import { sellerResponseTimeService } from '../sellers/seller-response-time.service';
```

## 2. داخل `sendMessage` — بعد إنشاء الرسالة وقبل/بعد الإشعارات

أضف (fire-and-forget):

```ts
    // TRACK-RESPONSE-TIME: update seller EMA on first reply in thread.
    // Never blocks or fails the message path.
    void sellerResponseTimeService.recordSellerFirstReply(
      conversationId,
      userId,
      conversation.sellerId,
      message.createdAt
    );
```

ضعه بعد `messagesRepository.create` نجح، مثلاً مباشرة بعد كتلة `activityService.record(...)`.

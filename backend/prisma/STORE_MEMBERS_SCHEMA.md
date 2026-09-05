# إضافة Store Members إلى `prisma/schema.prisma`

هذه هي التغييرات المطلوبة في الملف نفسه (ليس migration فقط).
بعد الدمج:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npm run type-check
```

`migrate deploy` يطبّق الجداول على DB؛ **`prisma generate` يقرأ schema.prisma** لبناء الـ Client.

---

## 1. داخل `model User` — أضف علاقتين

بجانب `storeFollows` / `storeReviewsGiven`:

```prisma
  storeMemberships          StoreMember[]        @relation("StoreMemberships")
  storeMembersInvited       StoreMember[]        @relation("StoreMembersInvited")
```

## 2. داخل `model StoreDetails` — أضف علاقة

بجانب `followers` / `collections`:

```prisma
  members         StoreMember[]
```

## 3. بعد `model StoreFollower` (أو قبل `StoreReview`) — أضف الموديل كاملًا

```prisma
// STORE-MEMBERS: staff permissions inside a single store.
// OWNER is never stored here — it is the SellerProfile that owns
// StoreDetails (sellerProfileId @unique). Soft-remove via status=REMOVED;
// partial unique index (storeId, userId) WHERE status IN (PENDING, ACTIVE)
// lives in the migration SQL so the same user can be re-invited later.
model StoreMember {
  id          String            @id @default(cuid())
  storeId     String
  userId      String
  role        StoreMemberRole
  status      StoreMemberStatus @default(PENDING)
  invitedById String
  invitedAt   DateTime          @default(now())
  acceptedAt  DateTime?
  removedAt   DateTime?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  store       StoreDetails      @relation(fields: [storeId], references: [id], onDelete: Cascade)
  user        User              @relation("StoreMemberships", fields: [userId], references: [id], onDelete: Cascade)
  invitedBy   User              @relation("StoreMembersInvited", fields: [invitedById], references: [id], onDelete: Restrict)

  @@index([storeId, status])
  @@index([userId, status])
  @@map("store_members")
}
```

## 4. بجانب enums المتجر (`StoreStatus` / `StorePlan`) — أضف

```prisma
enum StoreMemberRole {
  MANAGER
  STAFF
  EDITOR
}

enum StoreMemberStatus {
  PENDING
  ACTIVE
  REMOVED
}
```

## 5. داخل `enum AuditEventType` — أضف (إلزامي للكود)

```prisma
  STORE_MEMBER_INVITED
  STORE_MEMBER_REMOVED
```

---

## ترتيب العمل

1. عدّل `schema.prisma` كما فوق
2. تأكد أن مجلد الـ migration موجود:
   `prisma/migrations/20260905120000_add_store_members/migration.sql`
3. `npx prisma format && npx prisma validate`
4. `npx prisma generate`          ← هذا ما يضيف StoreMember للـ Client
5. `npx prisma migrate deploy`    ← يطبّق الجداول على قاعدة البيانات
6. `npm run type-check`

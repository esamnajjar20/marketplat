# Schema changes for Store Members

Apply these changes to `backend/prisma/schema.prisma`.

## 1. Add relations on User model (inside the existing User relations block)

```prisma
  storeMemberships          StoreMember[]        @relation("StoreMemberships")
  storeMembersInvited       StoreMember[]        @relation("StoreMembersInvited")
```

Place them next to the existing store relations:
```
  storeFollows              StoreFollower[]
  storeReviewsGiven         StoreReview[]        @relation("StoreReviewsGiven")
  storeMemberships          StoreMember[]        @relation("StoreMemberships")
  storeMembersInvited       StoreMember[]        @relation("StoreMembersInvited")
```

## 2. Add relation on StoreDetails

Inside `model StoreDetails`, add:

```prisma
  members         StoreMember[]
```

Next to:
```
  followers       StoreFollower[]
  collections     StoreCollection[]
  members         StoreMember[]
```

## 3. Add the new model (after StoreFollower / before StoreReview is fine)

```prisma
// STORE-MEMBERS: staff permissions inside a single store.
// OWNER is never stored here — it is the SellerProfile that owns
// StoreDetails (sellerProfileId @unique). Only invited roles live
// in this table. Soft-remove via status=REMOVED so invitation
// history and audit stay intact; the partial unique index on
// (storeId, userId) WHERE status IN (PENDING, ACTIVE) lets the
// same user be re-invited after removal.
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

## 4. Add enums (next to StorePlan / StoreStatus)

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

## 5. Extend AuditEventType (required — not optional)

Add to `enum AuditEventType` in schema.prisma (next to the other ADMIN_STORE_* values):

```prisma
  STORE_MEMBER_INVITED
  STORE_MEMBER_REMOVED
```

These are referenced directly as `AuditEvent.STORE_MEMBER_INVITED` /
`STORE_MEMBER_REMOVED` in store-members.service.ts. Without them the
backend will not compile.

Also add them in the migration SQL (see migration.sql ALTER TYPE).

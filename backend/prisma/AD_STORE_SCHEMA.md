# schema.prisma — Ad.storeId

## داخل `model Ad` (بعد sellerProfileId)

```prisma
  // Optional store as the *visible* publisher. userId remains the
  // owner for permissions/audit. null = personal ad.
  storeId           String?
  store             StoreDetails?  @relation(fields: [storeId], references: [id], onDelete: SetNull)

  @@index([storeId])
  @@index([storeId, status, createdAt])
```

## داخل `model StoreDetails`

```prisma
  ads                Ad[]
```

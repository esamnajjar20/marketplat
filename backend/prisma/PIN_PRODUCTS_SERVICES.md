# تثبيت المنتجات والخدمات (اختياري — schema)

الإعلانات لديها `Ad.isPinned` أصلًا.

## أضف في schema

```prisma
// model Product
isPinned  Boolean  @default(false)

// model ServiceListing
isPinned  Boolean  @default(false)
```

ثم migrate + generate.

## API سريع (نفس فكرة ads pin)

`PATCH /products/:id/pin` body `{ isPinned }`
`PATCH /service-listings/:id/pin` body `{ isPinned }`

منطق: مالك المتجر / مقدم الخدمة فقط؛ عند التثبيت يمكن فك تثبيت بقية عناصره.

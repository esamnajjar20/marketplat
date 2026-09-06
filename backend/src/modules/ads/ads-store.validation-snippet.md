# ads.validation.ts — createAdSchema body

```ts
    // Optional: publish under caller's store (visible publisher).
    // Omit or empty = personal ad (storeId null).
    storeId: z
      .string()
      .cuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
```

للـ multipart: الحقل النصي `storeId` من FormData.

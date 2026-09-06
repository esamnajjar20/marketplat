# ads.service.ts — createAd with optional storeId

## بعد `ensureSellerProfileForAdCreation` وقبل رفع الصور

```ts
    let resolvedStoreId: string | null = null;
    if (input.storeId) {
      const store = await prisma.storeDetails.findUnique({
        where: { id: input.storeId },
        include: { sellerProfile: { select: { userId: true } } },
      });
      if (!store) {
        throw new BadRequestError('Store not found.', 'STORE_NOT_FOUND');
      }
      if (store.sellerProfile.userId !== userId) {
        throw new ForbiddenError('You can only publish under your own store.', 'NOT_YOUR_STORE');
      }
      if (store.status !== 'ACTIVE') {
        throw new ForbiddenError(
          'Your store must be approved before publishing ads under it.',
          'STORE_NOT_ACTIVE'
        );
      }
      resolvedStoreId = store.id;
    }
```

## عند استدعاء `productsRepository`-style create / `adsRepository.create`

مرّر `storeId: resolvedStoreId` في data.

## ads.repository create signature

أضف `storeId?: string | null` إلى data وأدرجه في `prisma.ad.create({ data: { ..., storeId: data.storeId ?? null } })`.

## adWithRelations include

```ts
  store: {
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      status: true,
    },
  },
```

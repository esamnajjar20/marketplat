# Open Requests — Option B (implemented schema)

## What was added

| Object | Maps to |
|--------|---------|
| `Request` / `requests` | Open need (SERVICE \| PRODUCT \| RENTAL) |
| `RequestOffer` / `request_offers` | Offer from a user |
| Enums | `RequestType`, `RequestStatus`, `RequestOfferStatus` |

## What was NOT touched

- `ServiceRequest` — directed request to a specific service listing
- No `offererRole` column
- `budgetMin` / `budgetMax` nullable

## Accept offer (service layer — required pattern)

Required pattern (conditional update guards against double-accept):

```ts
await prisma.$transaction(async (tx) => {
  const result = await tx.request.updateMany({
    where: { id: requestId, status: 'OPEN' },
    data: { status: 'ACCEPTED', acceptedOfferId: offerId },
  });
  if (result.count === 0) throw new ConflictError('REQUEST_NOT_OPEN');
  await tx.requestOffer.update({
    where: { id: offerId },
    data: { status: 'ACCEPTED' },
  });
  await tx.requestOffer.updateMany({
    where: { requestId, id: { not: offerId }, status: 'PENDING' },
    data: { status: 'DECLINED' },
  });
});
```

## categoryId

String without Prisma FK. Service validates against:

- `SERVICE` → `ServiceCategory`
- `PRODUCT` → product category tree
- `RENTAL` → ad/category tree used for rentals

## Migration

```bash
cd backend && npx prisma migrate deploy
# or dev: npx prisma migrate dev
npx prisma generate
```


## API module (implemented)

Mount: `GET|POST /requests` …

| Method | Path | Action |
|--------|------|--------|
| GET | `/requests` | Open feed (`type`, `categoryId`, `city`) |
| GET | `/requests/me` | My requests |
| GET | `/requests/offers/me` | My offers |
| GET | `/requests/:id` | Detail + offers |
| POST | `/requests` | Create (max 5 OPEN, default 14d expiry) |
| PATCH | `/requests/:id/cancel` | Cancel if OPEN |
| POST | `/requests/:id/offers` | Submit/revise offer |
| DELETE | `/requests/:id/offers/:offerId` | Withdraw |
| PATCH | `/requests/:id/offers/:offerId/accept` | Accept (transactional) |

Files: `backend/src/modules/requests/*`

Rate limits: `createOpenRequestRateLimit` (10/h), `submitRequestOfferRateLimit` (30/h)

## Category validation (service)

| type | table |
|------|--------|
| SERVICE | `service_categories` (must be active) |
| PRODUCT | `product_categories` (must be active) |
| RENTAL | `categories` (ads tree) |

## Offer eligibility

| type | requirement |
|------|-------------|
| SERVICE | SellerProfile + ServiceProviderDetails |
| PRODUCT / RENTAL | SellerProfile |

## Expiry job

```bash
npm run report:expire-open-requests
```

`requestsService.expireDueRequests()` → OPEN with `expiresAt <= now` becomes EXPIRED.

# @marketplat/contracts

Shared runtime-validated API contracts for MarketPlat applications.

## Contract scope

- Success and error response envelopes, including `statusCode`, `code`, `requestId`, field errors and localized error metadata.
- Offset pagination query bounds matching Express (`page: 1..1000`, `limit: 1..100`).
- Pagination metadata shared by offset and cursor endpoints (`hasNextPage`, `hasPrevPage`, `nextCursor`).
- Forward-compatible unknown fields are preserved with Zod `passthrough()` on envelope/metadata objects.

## Consumer parity

The API, web and mobile currently retain their local imports because the web `frontend/` package is intentionally outside the pnpm workspace and the API/mobile TypeScript build boundaries are separate. The parity tests read those consumer definitions and fail when critical fields or bounds drift. This is an enforced compatibility layer, not yet a single runtime import shared by all three apps.

Run from the repository root:

```sh
node --test packages/contracts/test/*.test.mjs
```

Do not replace endpoint-specific schemas or limits with the generic pagination schema. Cursor endpoints may omit offset-only totals; consumers must continue to use `nextCursor` where applicable.

# @marketplat/contracts

Shared runtime-validated contracts for MarketPlat applications.

## Current scope

- API success envelope, matching `apps/api/src/shared/types/api-response.types.ts`.
- API error envelope, matching `apps/api/src/shared/errors/errorResponse.ts`.
- Generic pagination query and metadata primitives.

## Migration safety

This package is intentionally additive in this phase. Existing web and API imports are not redirected yet because the uploaded archive has no `pnpm-lock.yaml` and package installation/build validation has not run. Before consumers are switched, run contract fixtures against representative live API responses and ensure endpoint-specific pagination limits are preserved. Do not use these generic schemas as a replacement for endpoint-specific validation.

# @marketplat/contracts

Single runtime-validation and API-contract source used by the Express API, Next.js web app and Expo mobile app.

## Source of truth

- `src/validation/core.ts`: shared primitive constraints (email, names, phones, money, coordinates, strict query booleans/numbers and multipart booleans).
- `src/validation/auth.ts`: one password policy plus shared login and registration schemas.
- `src/validation/forms.ts`: shared auth, ad, product, service-listing, home-filter and request form schemas and field-error helpers.
- `src/pagination.ts`: shared pagination query and response metadata schemas.
- `src/api-response.ts`: shared API response envelope schemas.

Endpoint-specific API schemas remain next to their controllers because their fields, enums and authorization rules are domain-specific. They must compose the shared primitives instead of redefining common constraints. Web composer forms use the shared static-field schemas; dynamic attributes, selected image files and upload rules remain in the owning feature because they depend on runtime category/store/service configuration. The server remains authoritative; client-side validation is for early feedback and must never replace API validation.

## Runtime package

The package is compiled to CommonJS in `dist/` so that Express production builds, Next.js and Metro can load the same runtime Zod schemas. Run `pnpm --filter @marketplat/contracts build` after changing source files. The API, web and mobile lifecycle hooks build the package before dev, type-check, test and production build commands.

## Consumers

- API and mobile depend on this workspace package (`workspace:*`).
- `frontend/` is intentionally outside the pnpm workspace and consumes it through `file:../packages/contracts`.
- `shared/password-policy.ts`, `frontend/lib/requestFormValidation.ts` and `apps/mobile/src/lib/validation.ts` are compatibility facades only. Do not add validation rules to those files.

## Verification

```sh
pnpm --filter @marketplat/contracts type-check
pnpm --filter @marketplat/contracts test
pnpm --filter classifieds-platform-backend test -- --runInBand
npm --prefix frontend run test
pnpm --filter @marketplat/mobile test
```

After changing dependencies, run `pnpm install` at the repository root and `npm --prefix frontend install` for the non-workspace web app.


## Shared loading contract

`src/loading.ts` exports the cross-platform loading contract:

- `LoadingPhase` and `LOADING_PHASES` define stable operation names for web and mobile.
- `LOADING_COPY` and `getLoadingLabel()` provide one set of default user-facing labels.
- `LOADING_TIMING` defines shared delay, minimum-visible and navigation safety defaults.

The web and mobile apps may render their native components differently, but should not
create parallel phase names, default labels or timing values.

## Notifications

The notification contract is exported from the package root and lives in
`src/notifications.ts`. It provides Prisma-aligned notification types and
categories, complete labels/icons, platform-neutral deep-link targets,
notification preference defaults and validation, and the provider-neutral
push payload schema. Keep changes here first, then run the root
`audit:notification-contract` command to verify Prisma parity.

# Copilot instructions for MarketPlat

## Repository shape

This repo is a multi-app monorepo with three main product surfaces:

- `frontend/`: Next.js 15 web app using the App Router, PWA features, and Capacitor/native wrappers.
- `apps/api/`: Express + TypeScript backend with Prisma, PostgreSQL, Redis, JWT auth, and Swagger docs.
- `apps/mobile/`: Expo/React Native app for mobile flows.
- `workers/`: Cloudflare/edge worker packages.
- `packages/contracts`: shared contracts package for typed interfaces and API artifacts.

The repo intentionally mixes package managers: `frontend/` is managed with npm, while the rest of the monorepo is managed with pnpm. Do not add `frontend/` to the pnpm workspace or treat it as a normal pnpm package without a lockfile migration.

## Setup and required tools

- Node.js: use a current Node version compatible with the repo. The root/Next app expects Node 22+, and the API package allows Node 20+.
- Install dependencies from the repo root:

```bash
corepack pnpm install
corepack pnpm verify:workspace
```

- If you need the frontend app in isolation:

```bash
cd frontend
npm ci
```

- If you need the backend in isolation:

```bash
cd apps/api
npm ci
```

## Build, test, and lint commands

Run commands from the repo root when possible:

```bash
# frontend
corepack pnpm dev:web
corepack pnpm build:web
corepack pnpm test:web
corepack pnpm lint:web
corepack pnpm type-check:web

# backend
corepack pnpm dev:api
corepack pnpm build:api
corepack pnpm test:api
corepack pnpm lint:api
corepack pnpm type-check:api
```

Single-file or single-test execution:

```bash
# Frontend (Vitest)
cd frontend
npx vitest run __tests__/path/to/test.ts
# or
npx vitest run app/some-feature.test.ts

# Backend (Jest)
cd apps/api
npx jest tests/unit/path/to/test.ts --runInBand
# or
npx jest tests/integration/path/to/test.ts --runInBand
```

Useful repo-level aggregate commands:

```bash
corepack pnpm test:all
corepack pnpm lint:all
corepack pnpm type-check:all
```

## Architecture and code organization

### Frontend (`frontend/`)

The web app is a Next.js App Router project. The main app structure is split by concern:

- `frontend/app/`: route-level files and route groups (for example admin screens and public pages)
- `frontend/components/`: reusable UI and feature components
- `frontend/hooks/`: React hooks, especially query and mutation logic
- `frontend/lib/`: shared helpers, constants, data-layer utilities, and client-side logic
- `frontend/api/`: API client modules and endpoints
- `frontend/providers/`: app providers and shared state wiring
- `frontend/store/`: Zustand state when local client state is needed
- `frontend/__tests__/` and `frontend/e2e/`: unit/integration and Playwright tests

The frontend is built around Next.js server components and client-side hooks, with TanStack Query and app-level providers for data fetching and cache management. Prefer following the existing feature split rather than creating a new ad hoc structure in the same area.

### Backend (`apps/api/`)

The backend is a modular Express service with Prisma and Redis:

- `apps/api/src/modules/`: business modules (auth, users, ads, search, reports, etc.)
- `apps/api/src/routes.ts` and related route registration: central route wiring
- `apps/api/src/middlewares/`: auth, rate limiting, and request-scoped middleware
- `apps/api/prisma/`: schema, migrations, and generated Prisma client assets
- `apps/api/tests/`: unit/integration tests
- `apps/api/docs/`: API docs and environment-specific notes

The codebase favors feature modules rather than a single large monolith; add or extend the relevant module instead of adding unrelated top-level logic.

### Mobile (`apps/mobile/`)

The mobile app is an Expo app with `app/` and `src/` split for screens, navigation, and shared logic. It has its own verification scripts and Vitest setup; treat it as a separate product surface from the web app and API.

## Key conventions specific to this repo

- Keep app-specific package manager usage consistent with the local package. The repo root scripts intentionally delegate to `npm` for `frontend` and to `pnpm` for the app packages under the workspace.
- Prefer the least broad validation command that checks the changed behavior. For a frontend change, use the targeted Vitest file or the app-specific type-check; for backend changes, use a specific Jest test file or the affected module tests.
- When working in the monorepo, prefer the relevant app package command over a broad repo-wide suite unless the change truly spans multiple products.
- Follow the existing module structure: feature code belongs under the relevant `src/modules/*` backend module or the matching `frontend/components`, `frontend/hooks`, and `frontend/lib` areas.
- Use the repo’s existing verification tooling for app-specific quality gates (`verify:workspace`, `offline:*`, `audit:*`, mobile `verify:*` scripts) when a change touches system-wide behavior or request/cache semantics.
- Keep lockfiles stable; avoid changing package manager behavior or adding frontend dependencies to the workspace config without updating the project’s intended package-manager workflow.

## Useful repo-specific guidance

- The app is not a single-package Next.js app; it is a coordinated monorepo. Common mistakes include changing the web app as if it were the only runtime or mixing npm and pnpm workflows in the same directory.
- Many scripts are audit/debug-oriented and live at the root or package level. These are not generic development commands; they usually correspond to specific quality gates or performance audits.
- Keep changes aligned with the app’s existing boundaries: API work in `apps/api`, web UI work in `frontend`, mobile work in `apps/mobile`, shared contracts in `packages/contracts`.

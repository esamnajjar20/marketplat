# MarketPlat: migrate OpenNext incremental cache from R2 to Workers KV

## Current state

- OpenNext adapter remains `@opennextjs/cloudflare` (lockfile currently resolves 1.20.13).
- Incremental cache adapter is `kv-incremental-cache`.
- Queue and sharded tag cache Durable Objects are unchanged.
- API and self-service bindings are unchanged.
- R2 binding has been removed from `wrangler.jsonc`.

## Create the namespace

From this `frontend` directory, run:

```bash
npx wrangler@latest login
npx wrangler@latest kv namespace create NEXT_INC_CACHE_KV
```

Copy the returned 32-character `id` into `wrangler.jsonc`, replacing
`aa4ca4859c924617954a7752d4fc4c80` (created successfully in the user account). The binding uses the remote namespace during local development.

## Validate and deploy

```bash
npm run cloudflare:cache-audit
npm run build:cf
npx wrangler deploy
```

Use the same KV namespace for the production Worker configuration. If you later add a
Wrangler environment (for example `staging`), declare the matching KV binding in that
environment too.

## Operational limits and freshness

Workers KV is eventually consistent. A write may take 60 seconds or more to become
visible in other Cloudflare locations. KV Free currently includes 1 GB storage,
100,000 reads/day, and 1,000 writes/day; exceeding a daily operation allowance causes
operations of that type to fail until reset. Treat ISR output as a best-effort shared
cache, not as the source of truth. Keep authenticated/user-specific data and data that
requires immediate global freshness out of shared cached responses. Keep the existing
Durable Object tag cache and revalidation queue enabled.

## Rollback

To roll back, restore the prior `open-next.config.ts` R2 adapter import and restore the
`r2_buckets` binding in `wrangler.jsonc`, using the existing bucket name
`marketplat-next-cache`. No database migration is involved.

# MarketPlat Hyperdrive Probe

An isolated, read-only Cloudflare Worker to validate Hyperdrive connectivity to the existing Aiven PostgreSQL database before routing any production traffic through it.

- Uses `pg` (`node-postgres`) version `>=8.16.3`, the driver recommended by Cloudflare for Hyperdrive.
- Creates one `Client` per authenticated probe request and closes it after the query. No module-level client or `pg.Pool` is kept alive in the Worker.
- Runs only `SELECT 1::int AS ok`.
- Requires `HYPERDRIVE_PROBE_TOKEN` for the database probe endpoint.
- Leaves Express, Prisma, Go, API Gateway and production routes unchanged.
- Starts with Hyperdrive query caching disabled and a conservative origin connection limit of 5.

See [README_AR.md](./README_AR.md) for setup, Aiven firewall/TLS guidance, deployment, validation and rollback steps.

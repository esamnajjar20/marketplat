#!/bin/sh
# FIX D-14: previously CMD launched the server directly with no migration
# step anywhere in the deployment path. CI correctly runs
# `prisma migrate deploy` against the test database before testing, but
# production had no equivalent — a container could start successfully
# (pass its healthcheck) on a database that's missing a recent migration,
# only failing the first time a request touches the new schema. This
# entrypoint applies pending migrations on every container start, so a
# fresh/updated database is always brought up to date before the app
# accepts traffic.
#
# PROD-FIX-09: this is safe with a single container (this repo's own
# docker-compose.yml/docker-compose.full.yml both run exactly one `app`
# service), and Prisma's own advisory lock around `migrate deploy`
# prevents two concurrent runs from corrupting the migrations table
# even with multiple containers. But at N replicas (Kubernetes,
# `docker compose up --scale app=N`, or any multi-container deploy),
# every replica still re-runs this step on every restart — the lock
# only prevents corruption, not the N-1 replicas blocking on it and
# delaying their own startup on every rolling deploy, which gets worse
# the more replicas there are.
#
# RUN_MIGRATIONS_ON_BOOT (default: true, preserves the exact prior
# behavior for anyone running a single container) lets a multi-replica
# deployment opt out here and instead run `npx prisma migrate deploy`
# as its own one-shot step (a CI/CD pipeline stage, a Kubernetes Job/
# initContainer, etc.) before rolling out replicas that skip it.
set -e

if [ "${RUN_MIGRATIONS_ON_BOOT:-true}" = "true" ]; then
  echo "Applying pending database migrations..."
  npx prisma migrate deploy
else
  echo "RUN_MIGRATIONS_ON_BOOT=false — skipping migrations (expecting them to be applied by a separate deploy step)"
fi

echo "Starting server..."
# FIX AUDIT-V4-02: previously `exec node dist/server.js` — a single
# process, no multi-core usage, no isolation between a blocking
# bcrypt hash and other concurrent requests. pm2-runtime (not plain
# `pm2 start`) is PM2's Docker-specific entrypoint: it runs in the
# foreground (so the container's main process is actually PM2, not a
# detached daemon) and correctly forwards SIGTERM/SIGINT to the worker
# processes, which is what lets server.ts's existing graceful-shutdown
# handler still run on `docker stop` / `docker compose down`.
exec npx pm2-runtime ecosystem.config.js

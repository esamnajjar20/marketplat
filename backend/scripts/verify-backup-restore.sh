#!/bin/sh
#
# scripts/verify-backup-restore.sh
#
# FIX BACKUP-01: docker-compose.yml's db_backup service has run scheduled
# dumps since FIX D-21, but nothing has ever confirmed a dump file
# actually restores into a working database. "A backup exists" and "a
# backup works" are different claims — a silently-corrupted dump
# (truncated by a disk-full event mid-write, a pg_dump version mismatch,
# a permissions issue that failed the dump but not loudly enough) would
# only be discovered during a real incident, which is the worst possible
# time to discover it.
#
# What this script does, for real, against a REAL (throwaway) Postgres
# container — not a simulation of what a restore would do:
#   1. Finds the most recent backup file in the db_backups volume
#      (matching prodrigestivill/postgres-backup-local's real naming
#      convention: {daily,weekly,monthly,last}/DB-YYYYMMDD[-HHmmss].sql.gz).
#   2. Spins up a disposable, isolated Postgres container — NEVER touches
#      the real running `db` service, so this is safe to run against a
#      live production backup volume without any risk to the live
#      database.
#   3. Restores the dump into that disposable container.
#   4. Runs sanity checks: every expected table exists, and at least
#      confirms row counts are queryable (not "still zero everywhere",
#      which usually means the restore silently did nothing).
#   5. Tears the disposable container down either way and reports a
#      clear pass/fail — this is meant to be run on a schedule (e.g. a
#      weekly cron/CI job) or manually before trusting an on-call
#      runbook's "just restore the latest backup" step.
#
# This has NOT been executed against a real backup file or a real
# Docker daemon in the environment this script was written in — no
# Docker available there at all. Treat this as reviewed-by-reading,
# not verified-by-running, and do one real dry run before relying on
# it for actual disaster-recovery confidence. See the bottom of this
# file for what to double-check on that first run.
#
# Usage:
#   ./scripts/verify-backup-restore.sh [path-to-backup-volume]
#
# Defaults to the same named volume docker-compose.yml's db_backup
# service writes to. Requires: docker, a POSTGRES_PASSWORD env var (or
# .env file in this directory) matching whatever the real backup was
# taken with — restoring INTO the throwaway container uses its own
# fresh credentials, this is only needed to read POSTGRES_DB/USER for
# consistency in reporting, not to authenticate against anything real.

set -e

BACKUP_VOLUME_PATH="${1:-/var/lib/docker/volumes/classifieds-backend_db_backups/_data}"
POSTGRES_DB_NAME="${POSTGRES_DB:-classifieds_db}"
THROWAWAY_CONTAINER_NAME="classifieds-restore-verify-$$"
THROWAWAY_DB_PASSWORD="restore-verify-throwaway-password"
POSTGRES_IMAGE_TAG="15-alpine" # must match the real db service's image tag in docker-compose.yml

# Tables this app's schema.prisma actually defines (@@map names) — the
# restore is considered structurally sound only if ALL of these exist
# afterward, not just "some tables exist." Kept as an explicit list
# (not queried from information_schema and compared against nothing)
# so this script fails LOUDLY and specifically if the schema and this
# list drift apart, rather than silently checking fewer tables than the
# app actually has after someone adds a migration and forgets this file.
EXPECTED_TABLES="users categories ads favorites reports audit_logs password_reset_tokens"

log() { echo "[verify-backup-restore] $1"; }
fail() {
  echo "[verify-backup-restore] FAILED: $1" >&2
  # cleanup() is NOT called explicitly here — it's already registered
  # via `trap cleanup EXIT` below, and this function's own `exit 1`
  # triggers that trap. Calling it twice was harmless in practice
  # (docker rm -f is idempotent) but was sloppy and printed a
  # confusing duplicate "Cleaning up..." log line on every failure —
  # confirmed by actually running this path during testing.
  exit 1
}

cleanup() {
  log "Cleaning up throwaway container..."
  docker rm -f "$THROWAWAY_CONTAINER_NAME" > /dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# ── Step 1: find the most recent backup file ──────────────────────
log "Looking for backups under $BACKUP_VOLUME_PATH ..."

if [ ! -d "$BACKUP_VOLUME_PATH" ]; then
  fail "Backup volume path does not exist: $BACKUP_VOLUME_PATH (pass the real path as \$1, or check the volume actually has data — an empty/missing volume here IS itself a finding worth acting on, not just a script error)"
fi

# shellcheck source=scripts/lib/find-latest-backup.sh
. "$(dirname "$0")/lib/find-latest-backup.sh"
LATEST_BACKUP=$(find_latest_backup "$BACKUP_VOLUME_PATH" "$POSTGRES_DB_NAME")

if [ -z "$LATEST_BACKUP" ]; then
  fail "No backup files found matching ${POSTGRES_DB_NAME}-*.sql.gz under $BACKUP_VOLUME_PATH/{last,daily} — either db_backup has never run successfully, or POSTGRES_DB doesn't match what backups were actually taken with."
fi

log "Found: $LATEST_BACKUP"
# Uses GNU date's `-r <file>` (file mtime) — correct on the Linux hosts
# this is actually meant to run on (the docker-entrypoint.sh/Dockerfile
# in this repo are Linux-only already). NOT portable to macOS's BSD
# date if someone tries running this script directly on a Mac outside
# Docker — `date -r` means something different there. Run this inside
# a Linux container/CI runner, not on a Mac shell directly, if that
# distinction matters for your setup.
BACKUP_AGE_SECONDS=$(( $(date +%s) - $(date -r "$LATEST_BACKUP" +%s) ))
BACKUP_AGE_HOURS=$(( BACKUP_AGE_SECONDS / 3600 ))
log "Backup age: ~${BACKUP_AGE_HOURS}h"

if [ "$BACKUP_AGE_HOURS" -gt 48 ]; then
  # Not a hard failure by itself (SCHEDULE is configurable, and a
  # deliberately-paused backup service shouldn't make this script
  # unconditionally red) — but this is exactly the kind of drift a
  # scheduled run of this script exists to surface, so it's flagged
  # loudly rather than silently proceeding as if everything's normal.
  log "WARNING: latest backup is over 48h old — if SCHEDULE is @daily (the docker-compose.yml default), this likely means db_backup has been failing silently. Investigate before treating this restore test as reassuring."
fi

# ── Step 2: spin up a disposable Postgres container ────────────────
log "Starting throwaway Postgres container ($THROWAWAY_CONTAINER_NAME)..."

docker run -d \
  --name "$THROWAWAY_CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$THROWAWAY_DB_PASSWORD" \
  -e POSTGRES_DB="$POSTGRES_DB_NAME" \
  "postgres:${POSTGRES_IMAGE_TAG}" > /dev/null

log "Waiting for the throwaway container to accept connections..."
ATTEMPTS=0
until docker exec "$THROWAWAY_CONTAINER_NAME" pg_isready -U postgres > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -gt 30 ]; then
    fail "Throwaway Postgres container never became ready after 30s"
  fi
  sleep 1
done

# ── Step 3: restore the dump ────────────────────────────────────────
log "Restoring $LATEST_BACKUP into the throwaway container..."

if ! gunzip -c "$LATEST_BACKUP" | docker exec -i "$THROWAWAY_CONTAINER_NAME" psql -U postgres -d "$POSTGRES_DB_NAME" > /tmp/restore-verify-output.log 2>&1; then
  log "--- restore output (last 40 lines) ---"
  tail -n 40 /tmp/restore-verify-output.log
  fail "psql restore command exited non-zero — see output above. This is exactly the failure mode this script exists to catch before an actual incident does."
fi

# psql (unlike pg_restore with a custom-format dump) doesn't always
# exit non-zero on every kind of in-file error — grep the output for
# ERROR lines too, since a dump can "complete" while individual
# statements inside it silently failed.
if grep -qi "^psql:.*ERROR" /tmp/restore-verify-output.log; then
  log "--- errors found in restore output ---"
  grep -i "^psql:.*ERROR" /tmp/restore-verify-output.log
  fail "Restore completed but the output contains ERROR lines — a dump that 'runs' without every statement actually succeeding is not a verified-good backup."
fi

log "Restore command completed with no errors in the output."

# ── Step 4: sanity checks ───────────────────────────────────────────
log "Verifying expected tables exist..."

MISSING_TABLES=""
for TABLE in $EXPECTED_TABLES; do
  EXISTS=$(docker exec "$THROWAWAY_CONTAINER_NAME" psql -U postgres -d "$POSTGRES_DB_NAME" -tAc \
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '$TABLE');")
  if [ "$(echo "$EXISTS" | tr -d '[:space:]')" != "t" ]; then
    MISSING_TABLES="$MISSING_TABLES $TABLE"
  fi
done

if [ -n "$MISSING_TABLES" ]; then
  fail "Restored database is missing expected table(s):$MISSING_TABLES — the dump may be from an old schema version, or the restore silently dropped data. Cross-check against prisma/schema.prisma's current @@map names."
fi

log "All expected tables present: $EXPECTED_TABLES"

log "Checking row counts (informational — a 0-row table is not automatically a failure on a genuinely new/empty deployment, but is worth a human glance if you expected data)..."
for TABLE in $EXPECTED_TABLES; do
  COUNT=$(docker exec "$THROWAWAY_CONTAINER_NAME" psql -U postgres -d "$POSTGRES_DB_NAME" -tAc \
    "SELECT COUNT(*) FROM \"$TABLE\";")
  log "  $TABLE: $(echo "$COUNT" | tr -d '[:space:]') rows"
done

log ""
log "=== RESULT: backup restore verification PASSED ==="
log "Backup file:  $LATEST_BACKUP"
log "Backup age:   ~${BACKUP_AGE_HOURS}h"
log "All expected tables present and queryable after a real restore into a disposable container."
log ""
log "Reminder — what this DOES and does NOT confirm:"
log "  - CONFIRMS: the dump file is not corrupt, restores cleanly, and matches this app's current expected schema."
log "  - Does NOT confirm the backup's DATA is what you expect content-wise beyond row counts existing — add"
log "    application-specific checks below (e.g. 'at least one ACTIVE ad exists') if that distinction matters"
log "    for your own confidence level."
log "  - Does NOT test restoring onto the SAME Postgres major version as production if POSTGRES_IMAGE_TAG"
log "    above has drifted from docker-compose.yml's real db service tag — keep those in sync manually."

# cleanup runs via the EXIT trap regardless of how this script exits.

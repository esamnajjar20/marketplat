#!/bin/sh
# scripts/lib/find-latest-backup.sh
#
# Extracted from verify-backup-restore.sh into its own sourceable file
# specifically so this logic — the part most prone to a silent, easy-to-
# make bug (wrong glob, wrong folder, wrong sort order picking the
# OLDEST file instead of the newest) — can be exercised by a real test
# (scripts/__tests__/find-latest-backup.test.sh) without needing Docker
# or a real Postgres instance at all. The rest of verify-backup-restore.sh
# (actually restoring into a container) genuinely can't be tested without
# Docker; this part can be, so it is.
#
# Usage: find_latest_backup <backup_volume_path> <postgres_db_name>
# Prints the path to the latest backup file, or nothing (empty stdout)
# if none was found — callers check for an empty result themselves
# rather than this function calling `exit`, so it stays a pure,
# testable function rather than something that can kill the caller's
# shell out from under it.
find_latest_backup() {
  volume_path="$1"
  db_name="$2"

  # Prefer the `last/` folder — prodrigestivill/postgres-backup-local
  # stores every individual backup there (daily/weekly/monthly folders
  # only hold hard-linked copies of the latest-per-period), so `last/`
  # is the most granular place to find the truly most recent file.
  latest=$(find "$volume_path/last" -name "${db_name}-*.sql.gz" -type f 2>/dev/null | sort -r | head -n 1)

  if [ -z "$latest" ]; then
    # Fall back to daily/ in case this runs against an older image
    # version or differently-configured volume layout.
    latest=$(find "$volume_path/daily" -name "${db_name}-*.sql.gz" -type f 2>/dev/null | sort -r | head -n 1)
  fi

  echo "$latest"
}

#!/bin/sh
# scripts/__tests__/find-latest-backup.test.sh
#
# Real test — creates real temp directories and real (empty, but
# correctly-named) files, then calls the actual find_latest_backup
# function against them and checks its actual output. No mocking:
# this is pure filesystem logic, so there's nothing worth mocking.
#
# Run: sh scripts/__tests__/find-latest-backup.test.sh
# Exits 0 if every assertion passes, non-zero (with a clear message)
# on the first failure.

set -e

SCRIPT_DIR=$(dirname "$0")
. "$SCRIPT_DIR/../lib/find-latest-backup.sh"

TESTS_RUN=0
TESTS_FAILED=0

assert_eq() {
  expected="$1"
  actual="$2"
  description="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [ "$expected" != "$actual" ]; then
    echo "FAIL: $description"
    echo "  expected: $expected"
    echo "  actual:   $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo "PASS: $description"
  fi
}

# Fresh temp dir per test run so nothing leaks between local runs / CI
# runs, and so this never risks touching a real backup volume.
TMP_ROOT=$(mktemp -d)
cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT INT TERM

# ── Test 1: finds the single file in last/ ─────────────────────────
mkdir -p "$TMP_ROOT/test1/last"
touch "$TMP_ROOT/test1/last/classifieds_db-20260101-030000.sql.gz"

result=$(find_latest_backup "$TMP_ROOT/test1" "classifieds_db")
assert_eq "$TMP_ROOT/test1/last/classifieds_db-20260101-030000.sql.gz" "$result" \
  "finds the only backup file present"

# ── Test 2: picks the NEWEST of several files by name (not the oldest,
#    not an arbitrary one) ─────────────────────────────────────────
mkdir -p "$TMP_ROOT/test2/last"
touch "$TMP_ROOT/test2/last/classifieds_db-20260101-030000.sql.gz"
touch "$TMP_ROOT/test2/last/classifieds_db-20260103-030000.sql.gz"
touch "$TMP_ROOT/test2/last/classifieds_db-20260102-030000.sql.gz"

result=$(find_latest_backup "$TMP_ROOT/test2" "classifieds_db")
assert_eq "$TMP_ROOT/test2/last/classifieds_db-20260103-030000.sql.gz" "$result" \
  "picks the newest file by filename sort, not the oldest or a middle one"

# ── Test 3: falls back to daily/ when last/ is empty or missing ────
mkdir -p "$TMP_ROOT/test3/daily"
touch "$TMP_ROOT/test3/daily/classifieds_db-20260105.sql.gz"
# Deliberately no last/ directory at all for this case.

result=$(find_latest_backup "$TMP_ROOT/test3" "classifieds_db")
assert_eq "$TMP_ROOT/test3/daily/classifieds_db-20260105.sql.gz" "$result" \
  "falls back to daily/ when last/ doesn't exist"

# ── Test 4: does not match a different database's backup file ─────
mkdir -p "$TMP_ROOT/test4/last"
touch "$TMP_ROOT/test4/last/some_other_db-20260101-030000.sql.gz"

result=$(find_latest_backup "$TMP_ROOT/test4" "classifieds_db")
assert_eq "" "$result" \
  "does not match a backup file belonging to a different database name"

# ── Test 5: returns empty (not an error) when nothing exists at all ─
mkdir -p "$TMP_ROOT/test5"
# No last/, no daily/, no files.

result=$(find_latest_backup "$TMP_ROOT/test5" "classifieds_db")
assert_eq "" "$result" \
  "returns an empty result (not a shell error) when no backups exist"

# ── Test 6: only matches the .sql.gz suffix, ignoring unrelated files ─
mkdir -p "$TMP_ROOT/test6/last"
touch "$TMP_ROOT/test6/last/classifieds_db-20260101-030000.sql.gz"
touch "$TMP_ROOT/test6/last/classifieds_db-20260101-030000.sql.gz.tmp" # a partial/in-progress write, e.g.
touch "$TMP_ROOT/test6/last/README.txt"

result=$(find_latest_backup "$TMP_ROOT/test6" "classifieds_db")
assert_eq "$TMP_ROOT/test6/last/classifieds_db-20260101-030000.sql.gz" "$result" \
  "ignores non-.sql.gz files (e.g. a .tmp partial write) even with a matching prefix"

echo ""
echo "Ran $TESTS_RUN assertions, $TESTS_FAILED failed."

if [ "$TESTS_FAILED" -gt 0 ]; then
  exit 1
fi

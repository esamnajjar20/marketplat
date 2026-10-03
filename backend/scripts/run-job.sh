#!/usr/bin/env bash
# Unified cron entrypoint for marketplace backend jobs.
set -euo pipefail

JOB_NAME="${1:-}"
if [[ -z "$JOB_NAME" ]]; then
  echo "Usage: $0 <job-name>" >&2
  echo "Jobs:" >&2
  echo "  promotion-lifecycle | notification-digest | cleanup-notifications" >&2
  echo "  seller-response-metrics | weekly-ad-views | weekly-store-views | weekly-service-views" >&2
  echo "  cleanup-tokens | cleanup-failed-tasks | demote-stale-boosts | expire-open-requests" >&2
  echo "  expire-service-requests" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="${MARKETPLACE_BACKEND:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$BACKEND_ROOT"

if [[ ! -f package.json ]]; then
  echo "error: package.json not found in $BACKEND_ROOT" >&2
  exit 1
fi

LOG_DIR="${MARKETPLACE_LOG_DIR:-/var/log/marketplace}"
LOCK_DIR="${MARKETPLACE_LOCK_DIR:-/tmp/marketplace-cron-locks}"
mkdir -p "$LOG_DIR" "$LOCK_DIR" 2>/dev/null || {
  LOG_DIR="${BACKEND_ROOT}/logs/cron"
  LOCK_DIR="${BACKEND_ROOT}/logs/cron-locks"
  mkdir -p "$LOG_DIR" "$LOCK_DIR"
}

LOCK_FILE="${LOCK_DIR}/${JOB_NAME}.lock"
LOG_FILE="${LOG_DIR}/${JOB_NAME}.log"

case "$JOB_NAME" in
  promotion-lifecycle)     NPM_SCRIPT="report:promotion-lifecycle" ;;
  notification-digest)     NPM_SCRIPT="report:notification-digest" ;;
  cleanup-notifications)   NPM_SCRIPT="report:cleanup-notifications" ;;
  seller-response-metrics) NPM_SCRIPT="report:seller-response-metrics" ;;
  weekly-ad-views)         NPM_SCRIPT="report:weekly-ad-views" ;;
  weekly-store-views)      NPM_SCRIPT="report:weekly-store-views" ;;
  weekly-service-views)    NPM_SCRIPT="report:weekly-service-views" ;;
  cleanup-tokens)          NPM_SCRIPT="report:cleanup-tokens" ;;
  cleanup-failed-tasks)    NPM_SCRIPT="report:cleanup-failed-tasks" ;;
  demote-stale-boosts)     NPM_SCRIPT="report:demote-stale-boosts" ;;
  expire-open-requests)    NPM_SCRIPT="report:expire-open-requests" ;;
  expire-service-requests) NPM_SCRIPT="report:expire-service-requests" ;;
  *)
    echo "error: unknown job '$JOB_NAME'" >&2
    exit 2
    ;;
esac

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

{
  echo "===== $(ts) START job=${JOB_NAME} host=$(hostname) cwd=${BACKEND_ROOT} ====="
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "$(ts) SKIP job=${JOB_NAME} reason=already_running lock=${LOCK_FILE}"
    exit 0
  fi
  set +e
  npm run "$NPM_SCRIPT"
  STATUS=$?
  set -e
  if [[ $STATUS -eq 0 ]]; then
    echo "$(ts) OK job=${JOB_NAME} exit=0"
  else
    echo "$(ts) FAIL job=${JOB_NAME} exit=${STATUS}"
  fi
  echo "===== $(ts) END job=${JOB_NAME} ====="
  exit $STATUS
} >>"$LOG_FILE" 2>&1

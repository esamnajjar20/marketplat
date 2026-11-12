#!/usr/bin/env bash
# Removes files verified to have zero references (run from repo root).
set -euo pipefail
rm -v frontend/components/ui/empty-state.tsx   # duplicate of components/shared/feedback/EmptyState.tsx, 0 imports
rm -v frontend/lib/lastKnownLocation.ts        # saveLastKnownLocation/getLastKnownLocation: 0 callers

#!/usr/bin/env bash
# Run from the repo root (marketplat-main/). Removes leftover backup / disabled / scratch
# files found in frontend/. Review `git status` before committing.
set -euo pipefail
cd frontend
git rm -f --ignore-unmatch \
  eslint.config.mjs.bak-* \
  app/globals.css.SNIPPET \
  "app/(public)/loading.tsx.disabled" \
  "app/(public)/ads/loading.tsx.disabled" \
  "app/(public)/products/loading.tsx.disabled" \
  "app/(public)/services/loading.tsx.disabled" \
  "app/(public)/stores/loading.tsx.disabled" \
  report.zip skip-remaining.sh fix-vitest-batch1.sh
# Reformat the 6 minified sales components (one-liners; unreadable diffs):
npx prettier --write \
  components/sales/AddSaleDialog.tsx components/sales/ReturnSaleDialog.tsx \
  components/sales/CustomersPageClient.tsx components/sales/InstallmentsPageClient.tsx \
  components/sales/payments/InstallmentForm.tsx components/sales/payments/AddPaymentDialog.tsx

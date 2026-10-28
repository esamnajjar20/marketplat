#!/usr/bin/env bash
set -euo pipefail
cd ~/marketplace6/marketplace/frontend

echo "═══ 1. sw.js fallbacks ═══"
cp public/sw.js public/sw.js.pre-fix

# userDataEntries 40 → 400
sed -i 's/const MAX_USER_DATA_ENTRIES = MARKET_STORAGE_POLICY\.userDataEntries ?? 40;/const MAX_USER_DATA_ENTRIES = MARKET_STORAGE_POLICY.userDataEntries ?? 400;/' public/sw.js

# userDataBytes 8MB → 52428800
sed -i 's/const MAX_USER_DATA_BYTES = MARKET_STORAGE_POLICY\.userDataBytes ?? 8 \* 1024 \* 1024;/const MAX_USER_DATA_BYTES = MARKET_STORAGE_POLICY.userDataBytes ?? 52428800;/' public/sw.js

# imageEntries 80 → 160
sed -i 's/const MAX_IMAGE_ENTRIES = MARKET_STORAGE_POLICY\.imageEntries ?? 80;/const MAX_IMAGE_ENTRIES = MARKET_STORAGE_POLICY.imageEntries ?? 160;/' public/sw.js

# staticEntries 500 → 800
sed -i 's/const MAX_STATIC_ENTRIES = MARKET_STORAGE_POLICY\.staticEntries ?? 500;/const MAX_STATIC_ENTRIES = MARKET_STORAGE_POLICY.staticEntries ?? 800;/' public/sw.js

# staticBytes 30MB → 62914560
sed -i 's/const MAX_STATIC_BYTES = MARKET_STORAGE_POLICY\.staticBytes ?? 30 \* 1024 \* 1024;/const MAX_STATIC_BYTES = MARKET_STORAGE_POLICY.staticBytes ?? 62914560;/' public/sw.js

# savedAdsEntries 700 → 1000
sed -i 's/const MAX_SAVED_ADS_ENTRIES = MARKET_STORAGE_POLICY\.savedAdsEntries ?? 700;/const MAX_SAVED_ADS_ENTRIES = MARKET_STORAGE_POLICY.savedAdsEntries ?? 1000;/' public/sw.js

# personalShellEntries 300 → 500
sed -i 's/const MAX_PERSONAL_SHELL_ENTRIES = MARKET_STORAGE_POLICY\.personalShellEntries ?? 300;/const MAX_PERSONAL_SHELL_ENTRIES = MARKET_STORAGE_POLICY.personalShellEntries ?? 500;/' public/sw.js

echo "✓ sw.js fallbacks updated"
grep -n "MARKET_STORAGE_POLICY\..* ??" public/sw.js

echo ""
echo "═══ 2. cacheVersion.ts v62 → v63 ═══"
sed -i "s/export const SW_CACHE_VERSION = 'v62' as const;/export const SW_CACHE_VERSION = 'v63' as const;/" lib/cacheVersion.ts
grep -n "SW_CACHE_VERSION" lib/cacheVersion.ts | head -1

echo ""
echo "═══ 3. Test mocks — add filesToPublishFiles + getActiveOfflineDraftId ═══"

patch_mock() {
  local file="$1"
  if grep -q "filesToPublishFiles: vi.fn()" "$file"; then
    echo "↻ $file already patched"
    return
  fi
  # Replace the whole vi.mock block with the complete version
  node - "$file" <<'NODE'
const fs = require('fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
const re = /vi\.mock\('@\/lib\/offlineAdDrafts',\s*\(\)\s*=>\s*\(\{[\s\S]*?\}\)\s*\);/m;
const replacement = `vi.mock('@/lib/offlineAdDrafts', () => ({
  saveAdDraft: vi.fn().mockResolvedValue(undefined),
  clearActiveOfflineDraftId: vi.fn(),
  getActiveOfflineDraftId: vi.fn().mockReturnValue(null),
  filesToPublishFiles: vi.fn().mockResolvedValue([]),
}));`;
if (!re.test(s)) {
  console.error(`✗ ${p}: mock block not found`);
  process.exit(1);
}
s = s.replace(re, replacement);
fs.writeFileSync(p, s);
console.log(`✓ ${p} mock extended`);
NODE
}

patch_mock "__tests__/unit/hooks/useAdMutations.test.tsx"
patch_mock "__tests__/unit/hooks/useProductMutations.test.tsx"
patch_mock "__tests__/unit/hooks/useServiceListingMutations.test.tsx"

echo ""
echo "═══ 4. ServiceListingForm.test.tsx — add offlineAdDrafts mock ═══"

if grep -q "vi.mock('@/lib/offlineAdDrafts'" __tests__/components/ServiceListingForm.test.tsx; then
  echo "↻ already patched"
else
  # Insert mock right after the last existing vi.mock block
  node <<'NODE'
const fs = require('fs');
const p = '__tests__/components/ServiceListingForm.test.tsx';
let s = fs.readFileSync(p, 'utf8');
const block = `\nvi.mock('@/lib/offlineAdDrafts', () => ({\n  saveAdDraft: vi.fn().mockResolvedValue(undefined),\n  clearActiveOfflineDraftId: vi.fn(),\n  getActiveOfflineDraftId: vi.fn().mockReturnValue(null),\n  filesToPublishFiles: vi.fn().mockResolvedValue([]),\n}));\n`;
// Find last vi.mock(...)) ; and insert after
const re = /vi\.mock\([^)]*\)\);\n/g;
let lastEnd = -1, m;
while ((m = re.exec(s)) !== null) lastEnd = m.index + m[0].length;
if (lastEnd === -1) { console.error('no vi.mock found'); process.exit(1); }
s = s.slice(0, lastEnd) + block + s.slice(lastEnd);
fs.writeFileSync(p, s);
console.log('✓ ServiceListingForm.test.tsx mock added');
NODE
fi

echo ""
echo "═══ 5. Run cacheVersionSync + 5 mutation tests ═══"
npx vitest run \
  __tests__/unit/lib/cacheVersionSync.test.ts \
  __tests__/unit/hooks/useAdMutations.test.tsx \
  __tests__/unit/hooks/useProductMutations.test.tsx \
  __tests__/unit/hooks/useServiceListingMutations.test.tsx \
  __tests__/components/ServiceListingForm.test.tsx \
  2>&1 | tail -30

echo ""
echo "═══ Done. Review: ═══"
git diff --stat

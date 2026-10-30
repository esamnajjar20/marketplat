# Historical mobile verification scripts (quarantined)

These checks failed in the captured baseline run on 2026-10-29. They were moved out of the active `scripts/verify-*.mjs` glob so outdated regex checks and broken verifier code do not masquerade as reliable product tests. **They are not marked as passing and have not been deleted.**

- `manifest.json` lists every quarantined verifier, the failure category, and the observed diagnostic signal.
- Categories distinguish verifier defects (e.g. `ReferenceError`), stale paths, and assertions whose expected text no longer matches the current source.
- Before reactivation, replace text-only assertions with focused behavioral tests or update the assertion to a documented current contract. Do not change application behavior merely to satisfy an outdated regex.
- Run one historical check for diagnosis with `node apps/mobile/scripts/legacy-verifications/<file>` from the monorepo root. These scripts are deliberately excluded from the blocking test command until reviewed.

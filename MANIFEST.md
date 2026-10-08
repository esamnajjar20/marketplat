# Render Performance — Phases 1–6 cumulative patch

This archive contains only files changed/added by the render-performance work, not the full application.

## Included
- Phase 1: render audit/baseline tooling.
- Phase 2: centralized `useOnlineStatus` external store and tests.
- Phase 3: card memo boundaries and shared time source.
- Phase 4: memoized `ChatMessageRow` and isolated `RecordingTimer`.
- Phase 5: removal of provably redundant same-prefix Query invalidations; related tests updated.
- Phase 6: browser-native `content-visibility:auto` on high-frequency card/message roots and a documented virtualization decision gate.

## Important validation note
The source archive does not include installed `node_modules`, and dependency installation timed out in the validation environment. Therefore a full production TypeScript/build/test pass could not be truthfully claimed here.

Static validation performed:
- render audit executes successfully;
- no same-root `*.all()` + `*.detail(id)` invalidation pairs remain in the audited mutation paths;
- phase 2 online/offline listener architecture remains centralized;
- phase 3/4 memo/render boundaries remain present;
- changed files are syntax-reviewed and the cumulative patch is generated from the original archive.

## Virtualization
A true DOM virtualizer was not added speculatively. The app has variable-height cards/messages and no existing virtualization dependency. Native `content-visibility:auto` is the safe final optimization until browser profiling proves stable geometry and a real virtualizer is justified.

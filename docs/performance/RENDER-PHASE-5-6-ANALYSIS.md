# Deep analysis — Phases 5–6

## Query invalidation audit

The project contains many intentional broad invalidations because list queries are parameterized. The audit therefore did NOT replace every `*.all()` call blindly.

The safe class fixed here is:

```text
invalidate(['resource'])
+
invalidate(['resource','detail',id])
```

The second operation is redundant because the first prefix already matches it.

Invalidations for different roots remain separate because they represent different read models.

## Virtualization decision

A dependency-free, fixed-height virtualizer was rejected for this release because:

1. Cards contain variable text/metadata.
2. Grid geometry changes at responsive breakpoints.
3. Chat messages have highly variable heights and media.
4. Chat scroll anchoring is sensitive to measurement errors.
5. The current project has no virtualization dependency in `package.json`/lockfile.
6. The earlier phases have not yet been runtime-profiled in a browser session with production-sized data.

The implemented `content-visibility:auto` optimization is therefore the safe Phase-6 optimization rather than a speculative DOM virtualization rewrite.

## Acceptance criteria for true virtualization

Before introducing a real virtualizer, capture production-like traces and verify:

- >100 visible/loaded list items in a single view;
- measurable commit/render cost from offscreen rows;
- stable or measurable row geometry;
- no scroll anchoring regressions;
- no focus/accessibility regressions;
- no SSR/hydration mismatch;
- memory reduction is observable, not merely theoretical.

# tsconfig.json — Non-Obvious Decisions

## `skipLibCheck: true`

**What it does:** TypeScript skips type-checking inside `.d.ts` files —
both third-party (`node_modules/**/*.d.ts`) and this project's own
ambient declaration files, if any are added later.

**Why it's on:** several dependencies ship `.d.ts` files that conflict
with each other or with this project's own type augmentations when
checked strictly — the concrete case that surfaced this was an
`Express.User` augmentation conflict between two `@types/*` packages
pulled in transitively. `skipLibCheck` was the standard, low-friction
fix (it's also `create-t3-app`'s and Next.js's own default), rather
than pinning/patching the conflicting packages.

**Trade-off this creates:** type errors originating inside `.d.ts`
files — including in a hand-written project ambient declaration file,
should one be added — will not be caught by `tsc`. If a future
augmentation (another `Express.Request`/`Express.User` extension, a
custom `.d.ts` for an untyped dependency) silently conflicts with
another declaration the way the original `Express.User` case did,
`skipLibCheck` means the compiler will not flag it — the conflict
would only surface as a runtime `undefined` or an incorrect inferred
type at a call site, not a build error.

**If revisiting this:** narrow the scope instead of a blanket
off-switch — e.g. `skipLibCheck` only for `node_modules` via a
project-references split, or pin the specific conflicting `@types/*`
versions — before turning this back to `false` project-wide.

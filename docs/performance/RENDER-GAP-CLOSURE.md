# Render / Performance Gap Closure — Final Pass

## Implemented

- `ServiceProviderCard` and `AdListItem` now have `React.memo` boundaries.
- High-frequency card roots use `content-visibility:auto` with `contain-intrinsic-size` fallbacks.
- `ChatMessageRow` receives `isRetrying` instead of the shared `retryingQueueId` state value.
- The shared card clock now ticks once per minute while at least one consumer is mounted; there is never one timer per card.
- Favorites ID consumers now share one QueryCache subscription per QueryClient/query-key through an external-store registry. 50 cards no longer create 50 QueryCache listeners.
- `MessageInput` no longer owns the message body state. `MessageBodyEditor` owns the high-frequency keystroke state; the parent only receives the coarse `hasContent` signal and reads the exact value through a ref for submit/upload.
- All admin table roots now have `React.memo` boundaries so unrelated parent renders do not re-enter the table. Data rows also have offscreen containment. Full per-row component extraction remains a separate code-size-heavy refactor because each admin table has distinct row actions and state.
- `useRepublishAd` now invalidates the ad detail cache and its regression test explicitly protects that contract.
- Added `perf:render-regression` source-level CI guardrails.
- Added `perf:query-invalidation-audit` to inventory broad/prefix invalidations instead of blindly replacing legitimate cross-list invalidations.

## Verified architecture decisions

- `next-themes` is intentionally a global provider because `ThemeToggle`/`MobileNav` consume its context. There is no custom application-wide Context carrying frequently changing business state.
- `PresenceHeartbeat` cleans up its interval and browser listeners. `OfflineBootstrap` cleans up its periodic timers/listeners on effect teardown. PWA module-level timers are intentionally process/page scoped rather than React component scoped; they are not duplicated by component mounts.
- The existing GitHub Actions scheduled job already provides a daily cron trigger and manual dispatch. No duplicate cron trigger was added.

## Not safely executable from a ZIP-only workspace

The following require external infrastructure/account access or repository credentials and therefore were not fabricated:

- Uptime Robot monitor creation/configuration.
- GitHub secret creation/rotation.
- Cloudflare token rotation.
- Git push verification: the supplied ZIP has no `.git` metadata, so there is no authoritative local `git status`/remote state to inspect.
- Dependabot remediation count/security upgrade: requires dependency installation/audit against the current advisory database; the workspace does not contain installed dependencies and network installation was not used as a substitute for evidence.

## Runtime profiling limitation

The project has static regression guardrails, but actual React commit counts require a running browser build with dependencies installed and representative data. The package supports React DevTools/Playwright, but this ZIP-only environment cannot honestly claim a before/after Profiler trace.

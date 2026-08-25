# Test Fixes — Complete Package

unzip -o test-fixes-complete.zip
# from the project root (folder with backend/ and frontend/)

## Round 3 (this pass)
- backend/tests/integration/fraud.test.ts
  Scam-keyword edit now includes URL so CONTACT+KEYWORDS(+NEW_ACCOUNT)
  crosses FRAUD_AUTO_FLAG_THRESHOLD (60). Polls scoring instead of fixed sleep.
- backend/tests/integration/recommendations.test.ts
  Store ranking queries use limit:50 so fixtures are not pushed out of the default top-8.
- frontend/__tests__/components/MessageInput.test.tsx
  Align with optimistic clear + onError restore (no longer expects onSuccess).

## Rounds 1–2
Frontend mock completeness (selectUser, useIsSeller, admin bulk, QueryClient-related
component mocks, product.store fixtures, SearchResults useRouter).
Backend signature/expectation alignment (conversations, sellers, users, promotions,
favorites, recommendations unit, saved-searches Arabic fuzzy, activityBuffer isolation).
Auth integration: SameSite=None + manual Secure cookie re-attach on http://.

## Possibly still flaky / out of scope
- Remaining UI string drift in forms/AdDetail if labels changed further
- Full suite depends on Postgres + env matching CI

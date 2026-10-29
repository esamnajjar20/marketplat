# Mobile — Session / cookie / refresh device validation

**Status:** checklist only until filled after real-device runs.  
**Owner:** mobile + backend  
**Related:** `apps/mobile/src/features/auth/`, `apps/mobile/src/api/client.ts`

## Environment

| Item | Value (fill in) |
|------|-----------------|
| API origin | |
| Android device / emulator | |
| iOS device / simulator | |
| App build type | debug / internal-release / production-signed |
| Date | |

## Scenarios (must pass before claiming session works)

1. **Cold login**  
   - Fresh install → login with password → lands on authenticated home.  
   - Pass / Fail / Notes:

2. **Access token in SecureStore**  
   - Kill app process completely → reopen → still authenticated without re-entering password (while access token valid or refresh succeeds).  
   - Pass / Fail / Notes:

3. **Refresh via HttpOnly cookie**  
   - Force access token expiry (wait or clear only access token if test hook exists) → trigger authenticated API call → 401 → client refresh → retry succeeds.  
   - Android: Pass / Fail  
   - iOS: Pass / Fail  
   - Notes (CORS, SameSite, Secure, domain):

4. **Logout**  
   - Logout → SecureStore cleared → private caches cleared → next launch requires login.  
   - Pass / Fail / Notes:

5. **Logout with pending outbox**  
   - Create offline mutation (ad draft / order / chat) while offline → attempt logout → warning shown → “return to sync” cancels logout → “delete and leave” clears queues.  
   - Pass / Fail / Notes:

6. **Offline then online**  
   - Browse public feed offline (cache) → go online → sync outbox without duplicate creates (idempotency).  
   - Pass / Fail / Notes:

## Backend / cookie requirements (verify with API team)

- [ ] Refresh cookie `HttpOnly`, appropriate `Secure` / `SameSite` for native clients  
- [ ] CORS allows mobile origin or native cookie jar path is documented  
- [ ] Logout returns `Set-Cookie` max-age=0 for refresh cookie  

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Mobile | | | |
| Backend | | | |

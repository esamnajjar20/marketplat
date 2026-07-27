/**
 * e2e/tests/favorites.spec.ts
 *
 * PROD-FIX-14: favorites was explicitly listed in e2e/README.md's
 * "What's still NOT covered" section — "no spec file yet." This covers
 * the real user-facing flow: favoriting an ad from its detail page,
 * seeing it appear in /favorites, and un-favoriting it from there,
 * all through the real backend (favorites.api.ts -> POST
 * /api/v1/favorites/:adId -> favorites.service.ts), not a mocked hook.
 *
 * Each test creates its own user AND its own ad (via createAdViaUI,
 * shared with ad-lifecycle.spec.ts) so "this ad is/isn't in my
 * favorites" assertions are unambiguous regardless of what other
 * parallel tests are doing against the same shared E2E database.
 */
import { test, expect } from '../fixtures/authenticated';
import { createAdViaUI } from '../helpers/ads';
import { registerViaUI } from '../helpers/auth';
import { makeTestUser } from '../helpers/test-data';

test.describe('Favorites', () => {
  test('favoriting an ad from its detail page makes it appear in /favorites', async ({ page }) => {
    const title = await createAdViaUI(page);
    // createAdViaUI leaves the page on the newly-created ad's detail view.

    const favoriteButton = page.getByRole('button', { name: 'حفظ' });
    await favoriteButton.click();

    // AdDetail.tsx toggles a `fill-destructive text-destructive` class
    // on the heart icon when favorited=true (see handleFavorite) — this
    // is the only visible in-page confirmation, there's no success toast
    // for the happy path (only toggleFavorite's onError path toasts).
    await expect(page.locator('svg.fill-destructive')).toBeVisible();

    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  });

  test('un-favoriting from the detail page removes it from /favorites', async ({ page }) => {
    const title = await createAdViaUI(page);

    const favoriteButton = page.getByRole('button', { name: 'حفظ' });
    await favoriteButton.click();
    await expect(page.locator('svg.fill-destructive')).toBeVisible();

    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // Navigate back to the ad and un-favorite it — a full round trip,
    // not just asserting the button's local state reverts.
    await page.getByRole('heading', { name: title }).click();
    await expect(page).toHaveURL(/\/ads\/[a-zA-Z0-9-]+$/);
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.locator('svg.fill-destructive')).not.toBeVisible();

    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: title })).not.toBeVisible();
  });

  test('shows the empty state when a user has no favorites', async ({ page }) => {
    // authedPage fixture registers a brand-new user with no favorites
    // yet — no setup needed beyond visiting the page directly.
    await page.goto('/favorites');

    await expect(page.getByText('لا توجد إعلانات محفوظة')).toBeVisible();
    await expect(page.getByRole('link', { name: 'تصفح الإعلانات' })).toBeVisible();
  });

  test('favorites persists across a page reload (state is server-backed, not just local)', async ({ page }) => {
    const title = await createAdViaUI(page);
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.locator('svg.fill-destructive')).toBeVisible();

    await page.reload();

    // FavoritesList/AdDetail derive favorited state from the server
    // (see api/favorites.api.ts's FIX H-05 note: no client-only
    // favorited flag, state is always re-derived from the favorites
    // list) — a reload must still show the ad as favorited, not reset
    // to un-favorited, which would indicate favorite state is only
    // living in local component state rather than actually persisted.
    await expect(page.locator('svg.fill-destructive')).toBeVisible();

    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  });

  test('an unauthenticated visitor is prompted to log in instead of favoriting', async ({ browser }) => {
    // Deliberately a fresh, unauthenticated context rather than the
    // authedPage fixture — this test is specifically about the
    // logged-out path (AdDetail.tsx's handleFavorite: `if (!isAuth) {
    // toast.error(...); return; }`), so it must not inherit a logged-in
    // session from the fixture.
    const context = await browser.newContext();
    const guestPage = await context.newPage();

    // Reuse an ad created by a separate authenticated context, since
    // ad creation itself requires auth.
    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await registerViaUI(authorPage, makeTestUser());
    const title = await createAdViaUI(authorPage);
    const adUrl = authorPage.url();
    await authorContext.close();

    await guestPage.goto(adUrl);
    await expect(guestPage.getByRole('heading', { name: title })).toBeVisible();

    await guestPage.getByRole('button', { name: 'حفظ' }).click();
    await expect(guestPage.getByText('يرجى تسجيل الدخول أولاً')).toBeVisible();
    // Must not have optimistically toggled the icon despite being blocked.
    await expect(guestPage.locator('svg.fill-destructive')).not.toBeVisible();

    await context.close();
  });
});

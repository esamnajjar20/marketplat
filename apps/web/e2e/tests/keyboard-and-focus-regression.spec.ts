import { expect, test } from '@playwright/test';

test.describe('keyboard and focus regression', () => {
  test('keyboard navigation can move focus to an interactive control on the homepage', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveCount(1);
    const tagName = await focused.evaluate((element) => element.tagName.toLowerCase());
    const role = await focused.getAttribute('role');
    const tabIndex = await focused.getAttribute('tabindex');
    expect(['a', 'button', 'input', 'select', 'textarea'].includes(tagName) || role !== null || tabIndex !== null).toBe(true);
  });

  test('login form fields remain keyboard reachable in sequence', async ({ page }) => {
    await page.goto('/login');
    const email = page.locator('#email');
    const password = page.locator('#password');
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await email.focus();
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
  });

  test('search can be completed without clicking the submit button', async ({ page }) => {
    await page.goto('/search');
    const input = page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
    await input.fill('اختبار لوحة المفاتيح');
    await input.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('اختبار لوحة المفاتيح');
  });
});

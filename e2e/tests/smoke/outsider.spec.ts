import { test, expect, loginAs } from '../../fixtures/app';

test.describe('smoke · outsider', () => {
  test('не член зала не видит программу «Стенд Бокс»', async ({ page }) => {
    await loginAs(page, 'outsider', '/');
    await expect(page.getByText('AMRAP 12')).toHaveCount(0);
  });
});

import { test, expect, loginAs, expectNoHScroll } from '../../fixtures/app';

test.describe('smoke · coach', () => {
  test('видит кнопку «＋ Программа дня» и форму блоков', async ({ page }) => {
    await loginAs(page, 'coach', '/');
    await page.getByText('＋ Программа дня').click();
    await expect(page).toHaveURL(/\/wod\/new/);
    await expect(page.getByText('＋ Добавить блок')).toBeVisible();
    await expectNoHScroll(page);
  });
});

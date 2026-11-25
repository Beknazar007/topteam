// iPhone (WebKit): экраны с полями даты не шире экрана. Запуск: npx playwright test --project ios
import { test, expect, loginAs, expectNoHScroll } from '../../fixtures/app';

test('@ios программа дня: поле даты в пределах экрана, нет горизонтального скролла', async ({ page }) => {
  await loginAs(page, 'coach', '/wod/new');
  await expect(page.getByText('＋ Добавить блок')).toBeVisible();
  const right = await page.locator('input[type=date]').evaluate((el) => el.getBoundingClientRect().right);
  expect(right).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  await expectNoHScroll(page);
});

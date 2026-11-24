// QR/ссылка с кодом зала: человек вступает в зал сам, код вручную не спрашивается.
import { test, expect, loginAs, expectNoHScroll } from '../../fixtures/app';
import { GYM } from '../../stand/people.mjs';

test.describe('qr-join · новичок', () => {
  test('по ссылке /join/КОД вступает в зал без ввода кода и сразу видит анкету', async ({ page }) => {
    await loginAs(page, 'newbie', `/join/${GYM.code}`);
    await expect(page.getByText('Пара вопросов')).toBeVisible();
    await expect(page.locator('input[placeholder="ABC123"]')).toHaveCount(0);
    await expectNoHScroll(page);
  });

  test('без входа: код из ссылки уходит в кнопку «Открыть в Telegram»', async ({ page }) => {
    await page.goto(`/join/${GYM.code}`);
    await expect(page.getByRole('link', { name: /Открыть в Telegram/ })).toHaveAttribute('href', new RegExp(`startapp=${GYM.code}$`));
  });
});

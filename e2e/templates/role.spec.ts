// ШАБЛОН. qa копирует в e2e/tests/<feature>/<role>.spec.ts и заменяет <…>.
// Имена тестов — номер критерия приёмки из specs/<feature>.md: "AC-n: …".
import { test, expect, loginAs, rpc, expectNoHScroll } from '../../fixtures/app';

const ROLE = '<owner|coach|athlete|outsider>' as const;

test.describe(`<feature> · ${ROLE}`, () => {
  test('AC-1: <что видит/делает роль>', async ({ page }) => {
    await loginAs(page, ROLE as never, '/');
    await expect(page.getByRole('button', { name: '<текст кнопки>' })).toBeVisible();
    await expectNoHScroll(page);
  });

  test('AC-2: <чего роль НЕ может>', async ({ page }) => {
    await loginAs(page, ROLE as never, '/<путь>');
    await expect(page.getByRole('button', { name: '<текст>' })).toHaveCount(0);
    // и на уровне API:
    const r = await rpc(ROLE as never, '<rpc>', { /* аргументы */ });
    expect(JSON.stringify(r.body)).toContain('forbidden');
  });
});

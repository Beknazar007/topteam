// Дымовой тест стенда: приложение открывается у каждой роли на данных стенда.
import { test, expect, loginAs, rpc, expectNoHScroll } from '../../fixtures/app';

test.describe('smoke · athlete', () => {
  test('видит программу дня из 3 блоков и не может её создавать', async ({ page }) => {
    await loginAs(page, 'athlete', '/');
    await expect(page.getByText('Программа дня', { exact: true })).toBeVisible();
    await expect(page.getByText('AMRAP 12').first()).toBeVisible();
    await expect(page.getByText('＋ Программа дня')).toHaveCount(0);
    await expectNoHScroll(page);
  });

  test('мониторинг и номинации открываются без горизонтального скролла', async ({ page }) => {
    await loginAs(page, 'athlete', '/stats');
    await expect(page.getByText('Мой мониторинг')).toBeVisible();
    await expectNoHScroll(page);
    await page.goto('/leaderboard');
    await expect(page.getByText('🏆 Номинации')).toBeVisible();
    await expectNoHScroll(page);
  });

  test('атлет не может создать блок (API)', async () => {
    const r = await rpc('athlete', 'create_wod', { p_gym: '00000000-0000-0000-0000-000000000000', p_date: '2026-01-01', p_title: 'x' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).toContain('forbidden');
  });
});

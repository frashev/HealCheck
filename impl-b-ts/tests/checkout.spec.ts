import { test, expect } from './base';

test('checkout', async ({ page }) => {
  await page.goto(process.env.APP_URL!);
  await page.getByRole('button', { name: 'Вход' }).click();
  await page.fill('#user', 'Филип');
  await page.click('#login-btn');
  await page.getByTestId('add-1').click();
  await page.getByTestId('add-2').click();
  await expect(page.locator('#total')).toHaveText('30,00');
});

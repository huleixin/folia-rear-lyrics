import { test, expect } from './fixtures';

test.use({ viewport: { width: 900, height: 900 } });

test('optical B uses feDisplacementMap and the A/B modes remain switchable', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/dev-probe.html?probe=liquidGlass');
    await expect(page.getByRole('heading', { name: 'Liquid Glass · A/B 光学验证' })).toBeVisible();
    const opticalLens = page.getByTestId('optical-lens');
    await expect(opticalLens).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
    await expect.poll(() => opticalLens.evaluate((el) => getComputedStyle(el).backdropFilter)).toMatch(/^url\(/);
    await expect.poll(() => page.locator('svg filter feDisplacementMap').count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: '仅 A 普通毛玻璃' }).click();
    await expect(page.getByTestId('blur-lens')).toBeVisible();
    await expect(opticalLens).toBeHidden();
    await page.getByRole('button', { name: '仅 B 光学折射' }).click();
    await expect(opticalLens).toBeVisible();
    await expect(page.getByTestId('blur-lens')).toBeHidden();
    expect(errors).toEqual([]);
});

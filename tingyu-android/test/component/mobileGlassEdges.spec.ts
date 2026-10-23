import { test, expect } from './fixtures';
import '../../dev/probes/homeBehavior/probeApi';

// test/component/mobileGlassEdges.spec.ts
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const output = process.env.FOLIA_SCROLL_QA_OUTPUT;
test('footer optical silhouette and single-channel diagnostic', async ({ page }, info) => {
    await page.goto('/dev-probe.html?probe=homeBehavior&sandbox&covers=1');
    await page.waitForFunction(() => !!window.__homeProbe?.ready());
    await page.evaluate(() => window.__homeProbe!.setSuite('mobile'));
    await expect(page.locator('.ml-footer nav')).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
    await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"] {display:none!important}' });
    await page.locator('.ml-home-scroll').evaluate((el) => {el.scrollTop = el.scrollHeight;});
    await page.evaluate(() => {
        const backdrop = document.createElement('img');
        backdrop.src = '/assets/mobile-home/guess-you-like.png';
        backdrop.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:104;pointer-events:none';
        document.querySelector('.ml-footer')!.before(backdrop);
    });
    await page.waitForTimeout(500);
    const capture = async (name: string) => page.locator('.ml-footer').screenshot({path: output ? `${output}/${name}.png` : info.outputPath(`${name}.png`)});
    console.log('optical-geometry', await page.locator('.ml-footer').evaluate((footer) =>
        Array.from(footer.querySelectorAll<HTMLElement>(':scope > div, :scope > nav, [aria-current]')).map(el => {
            const css = getComputedStyle(el);
            const id = css.backdropFilter.match(/#([^"\)]+)/)?.[1];
            const filter = id ? document.getElementById(id) : null;
            return { cls: el.className, width: el.offsetWidth, height: el.offsetHeight, radius: css.borderRadius,
                clip: css.clipPath, displacementPasses: filter?.querySelectorAll('feDisplacementMap').length };
        })));
    if (process.env.FOLIA_GLASS_DIAG === 'before') {
        await capture('Folia-footer-optics-before');
        await page.evaluate(() => {
            for (const selector of ['.ml-mini', '.ml-footer nav', '.ml-footer [aria-current]']) {
                const el = document.querySelector<HTMLElement>(selector)!;
                const id = getComputedStyle(el).backdropFilter.match(/#([^"\)]+)/)?.[1];
                const filter = id ? document.getElementById(id) : null;
                if (!filter) continue;
                // Isolate the alpha/chromatic recombination: same radius, sampling and tint.
                const red = filter.querySelector('feDisplacementMap')!;
                red.setAttribute('result', 'refracted');
                for (const child of Array.from(filter.children)) {
                    if (/^(ch[012]|rg|refracted)$/.test(child.getAttribute('result') || '') && child !== red) child.remove();
                    else if (child.tagName === 'feDisplacementMap' && child !== red) child.remove();
                }
            }
        });
        await capture('Folia-footer-optics-single-channel');
        return;
    }
    await capture('Folia-footer-optics-after');
    for (const selector of ['.ml-mini', '.ml-footer nav']) {
        await expect(page.locator(selector)).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
        const optics = await page.locator(selector).evaluate((el) => {
            const css = getComputedStyle(el);
            const id = css.backdropFilter.match(/#([^"\)]+)/)![1];
            const filter = document.getElementById(id)!;
            return { clip: css.clipPath, passes: filter.querySelectorAll('feDisplacementMap').length,
                alphaSums: filter.querySelectorAll('feComposite[operator="arithmetic"]').length };
        });
        expect(optics.clip).toMatch(/^inset\(0px round/);
        expect(optics.passes).toBe(1);
        expect(optics.alphaSums).toBe(0);
        const bounds = await page.locator(selector).boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(393);
    }
});

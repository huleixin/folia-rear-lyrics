import { expect, test } from './fixtures';

// test/component/liquidMotion.spec.ts
// Browser plugin unavailable: use the repository gallery in installed Chrome.
test.beforeEach(async({page})=>{
    await page.setViewportSize({width:393,height:852});
    await page.goto('/dev-probe.html?probe=liquidMotion');
});

test('self-owned confirmation also retains its exit and consumes Back',async({page})=>{
    await page.getByTestId('open-self-confirm').click();
    const card=page.locator('[data-folia-themed-dialog]');
    await expect(card).toBeVisible();
    await page.evaluate(()=>(document.querySelector('[data-testid="back"]') as HTMLElement).click());
    await expect(card).toHaveCount(1);
    await expect(card).toHaveCount(0);
    await page.getByTestId('open-self-confirm').click();
    await expect(card).toHaveCount(1);
});

test('parent removal retains the real confirmation and sleep surfaces through exit',async({page})=>{
    await page.getByTestId('open-confirm').click();
    await expect(page.locator('[data-folia-themed-dialog]')).toBeVisible();
    await page.evaluate(()=>(document.querySelector('[data-testid="force-confirm-close"]') as HTMLElement).click());
    await expect(page.locator('[data-folia-themed-dialog]')).toHaveCount(1);
    await expect(page.locator('[data-folia-themed-dialog]')).toHaveCount(0);
    await page.getByTestId('open-sleep').click();
    await expect(page.locator('.sleep-sheet')).toBeVisible();
    await page.evaluate(()=>(document.querySelector('[data-testid="force-sleep-close"]') as HTMLElement).click());
    await expect(page.locator('.sleep-scrim[data-exiting="true"]')).toHaveCount(1);
    await expect(page.locator('.sleep-sheet')).toHaveCount(0);
});

test('sleep sheet consumes system Back and reverses an interrupted exit without duplicates',async({page})=>{
    await page.getByTestId('open-sleep').click();
    await expect(page.locator('.sleep-sheet')).toBeVisible();
    await page.evaluate(()=>{
        (document.querySelector('[data-testid="back"]') as HTMLElement).click();
        setTimeout(()=>(document.querySelector('[data-testid="open-sleep"]') as HTMLElement).click(),40);
    });
    await expect(page.locator('.sleep-sheet')).toHaveCount(1);
    await expect(page.locator('.sleep-scrim')).not.toHaveAttribute('data-exiting');
    await page.keyboard.press('Escape');
    await expect(page.locator('.sleep-sheet')).toHaveCount(0);
});

test('sheet animates, traps focus, consumes inside taps and exits once on outside tap',async({page},info)=>{
    await page.getByTestId('open-sheet').click();
    const dialog=page.getByRole('dialog',{name:'动效回归'});
    await expect(dialog).toBeVisible();
    await expect.poll(()=>dialog.evaluate(e=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m42))).toBeLessThan(1);
    await page.getByTestId('inside').click();await expect(dialog).toBeVisible();
    await page.getByTestId('external-close').focus();await page.keyboard.press('Tab');
    await expect(dialog.locator('header button')).toBeFocused();
    await page.screenshot({path:info.outputPath('sheet.png')});
    await page.mouse.click(10,80);
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('closed')).toHaveText('1');
    await expect(page.getByTestId('open-sheet')).toBeFocused();
});

test('parent-driven removal keeps the sheet until its exit finishes',async({page})=>{
    await page.getByTestId('open-sheet').click();
    await page.getByTestId('external-close').click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('menu reverses close on reopen and Escape closes the current instance only',async({page})=>{
    await page.getByTestId('open-menu').click();
    const menu=page.getByRole('menu');await expect(menu).toBeVisible();
    await page.keyboard.press('End');await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await page.keyboard.press('Home');await expect(menu.getByRole('menuitem').first()).toBeFocused();
    // Dispatch in one task to test interruption without Playwright waiting for stability.
    await page.evaluate(()=>{
        (document.querySelector('[data-testid="back"]') as HTMLElement).click();
        setTimeout(()=>(document.querySelector('[data-testid="open-menu"]') as HTMLElement).click(),40);
    });
    await expect(menu).not.toHaveClass(/closing/);
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
    await expect(page.getByTestId('closed')).toHaveText('1');
});

test('menu defers its action until exit and rejects repeated selection',async({page})=>{
    await page.getByTestId('open-menu').click();
    await page.evaluate(()=>{
        const button=document.querySelectorAll<HTMLElement>('[role="menuitem"]')[4];
        button.click();button.click();
    });
    await expect(page.getByTestId('sleep')).toHaveText('false');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByTestId('sleep')).toHaveText('true');
    await expect(page.getByTestId('closed')).toHaveText('1');
});

test('parent refresh preserves the focused menu action',async({page})=>{
    await page.getByTestId('open-menu').click();
    const last=page.getByRole('menuitem').last();
    await page.keyboard.press('End');await expect(last).toBeFocused();
    await page.evaluate(()=>(document.querySelector('[data-testid="refresh"]') as HTMLElement).click());
    await expect(page.getByTestId('refresh')).toContainText('1');
    await expect(last).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByTestId('closed')).toHaveText('1');
});

test('reduced motion and modal Back both complete dismissal',async({page})=>{
    await page.getByTestId('reduce').click();
    await page.getByTestId('open-sheet').click();
    await page.evaluate(()=>(document.querySelector('[data-testid="back"]') as HTMLElement).click());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('closed')).toHaveText('1');
    await page.getByTestId('open-menu').click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByTestId('closed')).toHaveText('2');
});


test('account-style confirmation keeps content during exit and can reverse',async({page})=>{
    const identityErrors:string[]=[];
    page.on('console',message=>{if(message.type()==='error'&&/same key|unique.*key/i.test(message.text()))identityErrors.push(message.text())});
    await page.getByTestId('open-confirm').click();
    const card=page.locator('[data-folia-themed-dialog="true"]');
    await expect(card).toBeVisible();
    await page.getByRole('button',{name:'取消切换',exact:true}).click();
    await expect(card).toHaveCount(1);
    await expect(card).toHaveCount(0);
    await page.getByTestId('open-confirm').click();
    await expect(card).toBeVisible();
    await page.evaluate(()=>{
        (document.querySelector('[data-folia-themed-dialog="true"] button') as HTMLElement).click();
        setTimeout(()=>(document.querySelector('[data-testid="open-confirm"]') as HTMLElement).click(),40);
    });
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    await page.getByRole('button',{name:'确认切换',exact:true}).click();
    await expect(card).toHaveCount(0);
    expect(identityErrors).toEqual([]);
});

import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {test,expect} from './fixtures';

// test/component/lxSourceManager.spec.ts
// Browser plugin not available; use the repository Playwright harness for the existing settings host.
test.use({viewport:{width:393,height:852},serviceWorkers:'block'});
test('imports a controlled mobile script from URL and exposes policy, update and rollback through the native settings model',async({page},info)=>{
    await page.addInitScript(()=>{localStorage.setItem('library_suite','mobile');localStorage.setItem('last_app_view','home');localStorage.setItem('i18nextLng','zh-CN');});
    await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    let version='1.0.0';const script=readFileSync(resolve('test/fixtures/lx-mobile/contract.js'),'utf8');
    await page.route('https://fixture.example/source.js',route=>route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:script.replace('@version 1.0.0',`@version ${version}`)}));
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/');await expect(page.getByTestId('mobile-home')).toBeVisible({timeout:60000});
    await page.waitForTimeout(1500);
    await page.evaluate(async()=>{
        const settings='/src/stores/useSettingsModalStore.ts',lx='/src/stores/useLxSourceStore.ts';
        (await import(settings)).useSettingsModalStore.getState().openSettingsFromIndex('integration');
        (await import(lx)).useLxSourceStore.getState().show();
    });
    const manager=page.locator('.ty-lx-manager');await expect(manager).toBeVisible();
    await manager.getByLabel('网络音源地址').fill('https://fixture.example/source.js');
    await manager.getByRole('button',{name:'从 URL 导入',exact:true}).click();
    await expect(manager.locator('.ty-lx-card')).toHaveCount(1,{timeout:20000});
    await expect(manager.locator('.ty-lx-badge')).toContainText('使用中');
    await manager.getByText('音质与换源策略',{exact:true}).click();
    const downgrade=manager.getByRole('button',{name:'自动音质降级：开',exact:true});await downgrade.click();
    await expect(manager.getByRole('button',{name:'自动音质降级：关',exact:true})).toHaveAttribute('aria-pressed','false');
    await manager.getByLabel('默认播放来源',{exact:true}).selectOption('tx');
    const model=await page.evaluate(async()=>{
        const path='/src/services/nativeSettingsSemantic.ts';const {captureSemanticSettings}=await import(path);
        return captureSemanticSettings(document.querySelector('.ty-lx-manager')!.closest('[data-folia-themed-dialog]') as HTMLElement,'lx-qa','洛雪').document;
    });
    expect(JSON.stringify(model)).toContain('自动音质降级：关');expect(JSON.stringify(model)).toContain('网络音源地址');
    await page.screenshot({path:info.outputPath('lx-mobile-manager.png')});
    await manager.getByText('音质与换源策略',{exact:true}).click();
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:info.outputPath('lx-desktop-manager.png')});await page.setViewportSize({width:393,height:852});
    version='2.0.0';await manager.getByRole('button',{name:'检查在线更新',exact:true}).click();
    await expect(manager.getByRole('button',{name:'安装更新（保留回退）',exact:true})).toBeVisible({timeout:20000});
    await manager.getByRole('button',{name:'安装更新（保留回退）',exact:true}).click();
    await expect(manager.locator('.ty-lx-meta')).toContainText('2.0.0',{timeout:20000});
    await manager.getByRole('button',{name:'回退上一版本',exact:true}).click();
    await expect(manager.locator('.ty-lx-meta')).toContainText('1.0.0');await expect(manager.locator('.ty-lx-card')).toHaveCount(1);
    await page.route('https://fixture.example/runaway.js',route=>route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:'/**\n * @name Runaway fixture\n */\nwhile(true){}'}));
    await manager.getByLabel('网络音源地址').fill('https://fixture.example/runaway.js');await manager.getByRole('button',{name:'从 URL 导入',exact:true}).click();
    await expect(manager.locator('.ty-lx-message[role="alert"]')).toBeVisible({timeout:15000});await expect(manager.locator('.ty-lx-card')).toHaveCount(1);await expect(manager.locator('.ty-lx-badge')).toContainText('使用中');
    await manager.getByRole('button',{name:'删除',exact:true}).click();await expect(manager.locator('.ty-lx-card')).toHaveCount(0);
    expect(errors).toEqual([]);
});

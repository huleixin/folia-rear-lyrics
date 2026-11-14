import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

// feedback-server/test/live-browser.mjs
// Credentials arrive only on stdin from the OS store; test only explicitly seeded synthetic rows.
const chunks=[];for await(const c of process.stdin)chunks.push(c);
const {url,readToken,adminToken}=JSON.parse(Buffer.concat(chunks).toString());
const browser=await chromium.launch({headless:true});
try{
  await mkdir(new URL('../../test-results/feedback-live/',import.meta.url),{recursive:true});
  for(const [name,width,height,colorScheme,token,admin] of [
    ['mobile-read',390,844,'light',readToken,false],
    ['mobile-manage',390,844,'dark',adminToken,true],
    ['pad-manage',1024,768,'light',adminToken,true]]){
    const page=await browser.newPage({viewport:{width,height},colorScheme});
    let errors=0;page.on('pageerror',()=>errors++);
    await page.goto(url+'/admin');
    await page.locator('#token').fill(token);await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.locator('#dashboard').waitFor({state:'visible'});
    const cookies=await page.context().cookies(url+'/api/admin/feedback');
    const session=cookies.find(c=>c.name==='ty_session');
    assert.ok(session?.httpOnly&&session.secure&&session.sameSite==='Strict');
    assert.equal(session.domain,new URL(url).hostname);assert.equal(session.path,'/api/admin');
    const csrf=await page.context().request.patch(url+'/api/admin/settings',{headers:{Origin:'https://untrusted.invalid'},data:{uploadsEnabled:true}});
    assert.ok([401,403].includes(csrf.status()),'Cross-origin cookie mutation must be rejected');
    await page.locator('[name=version]').fill('feedback-acceptance');
    await page.getByRole('button',{name:'筛选',exact:true}).click();
    const card=page.locator('#feedback article').filter({hasText:'Synthetic acceptance test, not user feedback'}).first();
    await card.waitFor();await card.locator('button').click();await page.locator('#detail').waitFor({state:'visible'});
    assert.equal(await page.locator('#token').inputValue(),'');
    assert.equal(await page.locator('#detail select').count(),admin?1:0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(admin){
      await page.locator('#detail select').selectOption('closed');
      await page.getByRole('button',{name:'保存处理状态',exact:true}).click();
      await page.locator('#detail').waitFor({state:'hidden'});
    }else await page.locator('#close').click();
    await page.screenshot({path:new URL('../../test-results/feedback-live/'+name+'.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
    assert.equal(errors,0);await page.close();
    console.log('PASS live admin browser '+name+' authentication/host-only secure cookie/CSRF/filter/detail/role/width');
  }
}finally{await browser.close();}

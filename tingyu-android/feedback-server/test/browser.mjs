import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {fixture,payload,submission} from './harness.mjs';

// Browser verification against actual handlers/SQLite adapter; not Cloudflare or Android devices.
const f=fixture(),seed=await submission(f,payload({description:'<img src=x onerror=alert(1)> 手机筛选测试'}));
const {id}=await (await f.call('/api/feedback',seed.request)).json();
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const b of req)chunks.push(b);
 const request=new Request('http://127.0.0.1:8790'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
 const response=await worker.fetch(request,f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(500);res.end();}});
await new Promise(r=>server.listen(8790,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true});await mkdir(new URL('../../test-results/feedback',import.meta.url),{recursive:true});
 for(const [name,width,height,colorScheme]of [['mobile-light',390,844,'light'],['mobile-dark',390,844,'dark'],['pad',1024,768,'light'],['desktop',1440,900,'dark']]){
  const page=await browser.newPage({viewport:{width,height},colorScheme});let dialogs=0;page.on('dialog',d=>{dialogs++;void d.dismiss();});
  await page.goto('http://127.0.0.1:8790/admin');await page.locator('#token').fill(f.env.FEEDBACK_ADMIN_TOKEN);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('#dashboard').waitFor({state:'visible'});
  await page.getByRole('button',{name:id,exact:true}).waitFor();assert.equal(await page.locator('#feedback img').count(),0);assert.equal(dialogs,0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('[name=type]').selectOption('playback');await page.getByRole('button',{name:'筛选',exact:true}).click();await page.getByRole('button',{name:id,exact:true}).click();await page.locator('#detail').waitFor({state:'visible'});
  await page.locator('#detail select').selectOption('verification');await page.getByRole('button',{name:'保存处理状态'}).click();await page.locator('#detail').waitFor({state:'hidden'});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:new URL('../../test-results/feedback/'+name+'.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.close();console.log('PASS admin browser '+name+' login/filter/manage/XSS/width');
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}

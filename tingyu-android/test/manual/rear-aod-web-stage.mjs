// test/manual/rear-aod-web-stage.mjs
// Run against a built local preview; browser evidence only, never Android DOZE proof.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:904,height:572}});
let current=8,epoch='test#1';const errors=[];page.on('pageerror',e=>errors.push(e.message));
const lines=Array.from({length:12},(_,i)=>({fullText:'听屿歌词舞台 '+i,startTime:i*5,endTime:(i+1)*5,words:[{text:'听屿歌词舞台 '+i,startTime:i*5,endTime:(i+1)*5}]}));
const config={activePlaybackContext:'main',stageSource:null,hasTrack:true,song:{id:'test',name:'测试歌曲'},playbackSongKey:'test',playbackSessionId:'test',playbackEpoch:epoch,songArtist:'听屿',songAlbum:null,coverUrl:null,lyrics:{lines},theme:{id:'test',name:'test',backgroundColor:'#0b1720',primaryColor:'#dfbd62',secondaryColor:'#909aab',accentColor:'#dfbd62',fontFamily:'sans'},isDaylight:false,visualizerMode:'fume',visualizerFrameRate:60,staticMode:false,seed:'test',lyricsFontScale:1,subtitleFontScale:1,visualizerOpacity:1,background:{mode:'monet'}};
await page.route('**/__folia_rear/**',async route=>{const url=route.request().url();let body={};if(url.includes('/state'))body={revision:1,config,clock:{currentTime:current,duration:60,playerState:'PLAYING',playbackSongKey:'test',playbackSessionId:'test',requestId:'request',playbackRate:1,sentAtMs:Date.now()},owner:{engine:'compatible',songKey:'test',epoch,outputSessionId:'test',eventRevision:1,requestId:'request'}};if(url.includes('/viewport'))body={width:904,height:572,displayWidth:904,displayHeight:572,density:1};await route.fulfill({json:body});});
await page.goto((process.env.AOD_PREVIEW_URL??'http://127.0.0.1:4175')+'/rear-lyrics.html');await page.waitForTimeout(5000);
const frame=page.frames().find(f=>f.url().includes('layer=lyrics'));if(!frame)throw Error('no iframe');
await frame.waitForSelector('[data-visualizer-mode="fume"]');
const stage=frame.locator('[data-visualizer-mode="fume"]');await stage.evaluate(e=>e.dataset.qaIdentity='same');
await fs.mkdir('test-results/aod-stage',{recursive:true});await page.screenshot({path:'test-results/aod-stage/normal.png'});
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('folia-rear-mode',{detail:{mode:'AOD'}})));await page.waitForTimeout(1500);
if(await stage.getAttribute('data-qa-identity')!=='same')throw Error('stage remounted');
if(await frame.evaluate(()=>document.documentElement.dataset.rearAod)!=='true')throw Error('iframe not in AOD');
await page.screenshot({path:'test-results/aod-stage/aod.png'});
current=36;await page.evaluate(()=>window.dispatchEvent(new Event('folia-rear-refresh')));await page.waitForTimeout(1600);
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('folia-rear-mode',{detail:{mode:'NORMAL'}})));await page.waitForTimeout(1500);
if(await stage.getAttribute('data-qa-identity')!=='same')throw Error('stage remounted on resume');
await page.screenshot({path:'test-results/aod-stage/resumed.png'});
console.log(JSON.stringify({sameStage:true,iframeAod:true,errors}));await browser.close();if(errors.length)process.exitCode=1;


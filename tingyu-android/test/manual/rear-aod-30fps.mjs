import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// test/manual/rear-aod-30fps.mjs
// Browser plugin not available. Vite runtime measurement only; never Android DOZE/presented FPS evidence.
const browser=await chromium.launch({headless:true});
try {
    const page=await browser.newPage({viewport:{width:904,height:572},serviceWorkers:'block'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let base=6,at=Date.now(),playing=true,epoch='one',revision=1,stateReads=0;
    const lines=Array.from({length:12},(_,i)=>({fullText:'测试歌词',startTime:i*8,endTime:(i+1)*8,words:[{text:'测试',startTime:i*8,endTime:i*8+4},{text:'歌词',startTime:i*8+4,endTime:(i+1)*8}]}));
    const config={activePlaybackContext:'main',stageSource:null,hasTrack:true,song:{id:'test',name:'Test'},playbackSongKey:'test',playbackSessionId:'test',playbackEpoch:epoch,songArtist:'Test',songAlbum:null,coverUrl:null,lyrics:{lines,isWordByWord:true},theme:{name:'Test',backgroundColor:'#0b1720',primaryColor:'#dfbd62',secondaryColor:'#909aab',accentColor:'#dfbd62',fontStyle:'sans'},isDaylight:false,visualizerMode:'fume',visualizerFrameRate:60,staticMode:false,seed:'test',lyricsFontScale:1,subtitleFontScale:1,visualizerOpacity:1,background:{mode:'monet'}};
    await page.route('**/__folia_rear/**',async route=>{
        const url=route.request().url();let body={};
        if(url.includes('/state')){stateReads++;body={revision,config:{...config,playbackEpoch:epoch},clock:{currentTime:base+(playing?(Date.now()-at)/1000:0),duration:96,playerState:playing?'PLAYING':'PAUSED',playbackSongKey:'test',playbackSessionId:'test',requestId:'request',playbackRate:1,sentAtMs:Date.now()},owner:{engine:'compatible',songKey:'test',epoch,outputSessionId:'test',eventRevision:revision,requestId:'request'}};}
        if(url.includes('/viewport'))body={width:904,height:572,displayWidth:904,displayHeight:572,density:1};
        await route.fulfill({json:body});
    });
    await page.goto((process.env.AOD_PREVIEW_URL??'http://127.0.0.1:4180')+'/rear-lyrics.html');
    await page.waitForTimeout(3000);
    const frame=page.frames().find(f=>f.url().includes('layer=lyrics'));assert(frame,'lyrics iframe');
    const canvas=frame.locator('canvas').first();await canvas.waitFor();await canvas.evaluate(e=>e.dataset.qaIdentity='same');
    const stats=()=>frame.evaluate(async()=>{
        const url=performance.getEntriesByType('resource').find(r=>r.name.includes('/src/utils/visualizerFrameChannel.ts'))?.name;
        if(!url)throw Error('Run this measurement against Vite, not a built production bundle');
        return (await import(url)).getVisualizerLowPowerStats();
    });
    const mode=value=>page.evaluate(mode=>window.dispatchEvent(new CustomEvent('folia-rear-mode',{detail:{mode}})),value);
    await mode('AOD');await page.waitForTimeout(400);
    const before=await stats(),readsBefore=stateReads;await page.waitForTimeout(3000);const after=await stats();
    const callbackHz=(after.requests-before.requests)*1000/(after.measuredMs-before.measuredMs);
    assert(callbackHz>5&&callbackHz<33,JSON.stringify({callbackHz,after}));
    const readsDuringSample=stateReads-readsBefore;assert(readsDuringSample<=4,'state bridge must stay at calibration cadence, not 30Hz');
    assert.equal(await canvas.getAttribute('data-qa-identity'),'same');
    await fs.mkdir('test-results/aod-30',{recursive:true});await page.screenshot({path:'test-results/aod-30/aod.png'});
    playing=false;base=32;at=Date.now();await page.evaluate(()=>window.dispatchEvent(new Event('folia-rear-refresh')));await page.waitForTimeout(1300);
    const paused=await stats();await page.waitForTimeout(1200);assert.equal((await stats()).requests,paused.requests,'paused stage must stop continuous callbacks');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:true}})));await page.waitForTimeout(300);assert.equal((await stats()).pending,false);
    playing=true;base=48;at=Date.now();epoch='two';revision++;
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:false}})));await page.waitForTimeout(1500);
    assert((await stats()).requests>0,'new epoch recovers rendering');
    await mode('NORMAL');await page.waitForTimeout(300);assert.equal((await stats()).pending,false);
    await mode('AOD');await page.waitForTimeout(400);assert((await stats()).requests>0);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({callbackHz,stateReadsDuring3Seconds:readsDuringSample,cadenceFps:after.cadenceFps,workMs:after.workMs,downgrades:after.downgrades,recoveries:after.recoveries,pausedStops:true,hiddenCancels:true,epochResumes:true,presentedFps:'unmeasured',errors}));
} finally {await browser.close();}

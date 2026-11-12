import {test,expect} from './fixtures';

// test/component/rearBoot.spec.ts
// Full rear document + real iframe renderer; browser evidence only, not Android host proof.
test('rear document relays configuration to the real iframe before ready',async({page})=>{
    const stages=new Set<string>();let ready=0;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/__folia_rear/boot*',route=>{stages.add(new URL(route.request().url()).searchParams.get('stage')!);return route.fulfill({json:{}});});
    await page.route('**/__folia_rear/ready*',route=>{ready++;return route.fulfill({json:{}});});
    await page.route('**/__folia_rear/viewport*',route=>route.fulfill({json:{}}));
    await page.route('**/__folia_rear/state*',route=>route.fulfill({json:{revision:1,config:{
        hasTrack:true,song:{id:'boot-test',name:'Boot test'},songArtist:'Test',lyrics:{lines:[{fullText:'Boot lyric',startTime:0,endTime:20,words:[]}]},
        theme:{animationIntensity:'normal',fontStyle:'sans',accentColor:'#80cdb0',wordColors:[],lyricsIcons:[],id:'test',name:'Test',backgroundColor:'#09090b',textColor:'#f4f4f5',primaryColor:'#f4f4f5',secondaryColor:'#71717a'},
        visualizerMode:'classic',isDaylight:false,lyricsFontScale:1,visualizerOpacity:1,subtitleOverlayOpacity:0,staticMode:true,seed:1,updatedAt:1,
    },clock:{currentTime:1,duration:100,playerState:'PAUSED',playbackRate:1,sentAtMs:Date.now()}}}));
    await page.goto('/rear-lyrics.html');
    await expect.poll(()=>[...stages]).toEqual(expect.arrayContaining(['js-entry','react-mounted','state-config','iframe-mounted','config-received']));
    await expect.poll(()=>ready,{timeout:30000}).toBeGreaterThan(0);
    expect(stages.has('configured')).toBe(true);expect(errors).toEqual([]);
});

for(const mode of ['nebbia','machi'])test(mode+' remains selected through the rear iframe and forwards camera calibration',async({page})=>{
    await page.setViewportSize({width:347,height:212});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/__folia_rear/{boot,ready,viewport}*',route=>route.fulfill({json:{}}));
    await page.route('**/__folia_rear/state*',route=>route.fulfill({json:{revision:1,config:{
        hasTrack:true,song:{id:'rear-calibration',name:'Calibration'},lyrics:{lines:[{fullText:'全景保留，歌词安全显示',startTime:0,endTime:20,words:[]}]},
        theme:{animationIntensity:'normal',fontStyle:'sans',accentColor:'#80cdb0',wordColors:[],lyricsIcons:[],id:'test',name:'Test',backgroundColor:'#09090b',textColor:'#f4f4f5',primaryColor:'#f4f4f5',secondaryColor:'#71717a'},
        visualizerMode:mode,isDaylight:false,lyricsFontScale:1,visualizerOpacity:1,subtitleOverlayOpacity:1,staticMode:true,seed:1,updatedAt:1,
    },clock:{currentTime:10,duration:100,playerState:'PAUSED',playbackRate:1,sentAtMs:Date.now()}}}));
    await page.goto('/rear-lyrics.html?safeLeftPx=350&physicalWidthPx=976');
    const iframe=page.locator('iframe');await expect(iframe).toHaveAttribute('src',/safeLeftPx=350/);
    const frame=page.frameLocator('iframe');
    await expect(frame.locator(mode==='machi'?'[data-machi-ready="true"]':'[data-nebbia-ready="true"]')).toBeVisible({timeout:45000});
    const canvas=frame.locator('canvas').first(),bounds=(await canvas.boundingBox())!;
    expect(bounds.x).toBe(0);expect(bounds.width).toBeCloseTo(347);expect(bounds.height).toBeCloseTo(212);
    await expect(frame.locator('[data-rear-subtitles]')).toBeVisible();
    for(const fitted of await frame.locator('[data-rear-fitted-content]').all())expect((await fitted.boundingBox())!.x).toBeGreaterThan(124);
    expect(errors).toEqual([]);
});




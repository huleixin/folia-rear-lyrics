import {test,expect} from './fixtures';

// Browser plugin not available. Exercise the actual React forms with a bounded native API fixture.
for(const width of [393,900])test(`offline cache and routing controls at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{
        localStorage.setItem('i18nextLng','zh-CN');
        const w=window as any;w.__cacheRequests=[];
        const audio={enabled:true,wifiOnly:true,autoPlaylist:false,bytes:4469135769,cached:120,pending:278,running:1,complete:165,failed:2,cancelled:0,evicted:0,stale:0,networkAllowed:true,incompleteCatalogs:0,paused:false,collections:[{id:'other',name:'其他歌单',total:50,complete:50,failed:0,pending:0,running:0},{id:'fixture',name:'测试歌单',total:396,complete:115,failed:2,pending:278,running:1}],tasks:[{title:'正在缓存歌曲',state:'running',bytes:6000000,reason:''}],catalogs:[]};
        const resources={enabled:true,wifiOnly:true,lyricsBytes:1048576,artworkBytes:2097152,total:396,completed:0,lyricsReady:125,artworkReady:90,failed:0,cachedSongs:125,pending:396,metadataComplete:true,discovered:396,paused:false,networkAllowed:true,jobState:'running',nextDue:0,platformPending:0,lastError:''};
        w.__offlineNative={audioOffline:async(d:any={})=>{
            w.__cacheRequests.push(d);
            if(d.action==='configure'){Object.assign(audio,d);if('resourceEnabled'in d)resources.enabled=d.resourceEnabled;if('wifiOnly'in d)resources.wifiOnly=d.wifiOnly;}
            if(d.action==='tasks'){const total=d.state==='failed'?1:396;const offset=d.offset??0;return{total,offset,tasks:Array.from({length:Math.min(20,total-offset)},(_,i)=>({title:(d.state==='failed'?'失败歌曲 ':'待缓存歌曲 ')+(offset+i+1),state:d.state==='failed'?'failed':'pending',bytes:0,reason:d.state==='failed'?'下载超时，请检查网络后重试':''}))};}
            return structuredClone(audio);
        },resourceCache:async()=>structuredClone(resources)};
    });
    await page.route('**/src/platform/tingyuPlayback.ts',route=>route.fulfill({contentType:'text/javascript',body:'export const getTingyuPlayback=()=>window.__offlineNative;'}));
    await page.route('**/src/platform/runtime.ts',route=>route.fulfill({contentType:'text/javascript',body:'export const isCapacitorAndroid=()=>true;'}));
    await page.goto('/dev-probe.html?probe=offlineCache');
    await expect(page.getByRole('heading',{name:'离线缓存',exact:true})).toBeVisible();
    await expect(page.getByText('已缓存 120 首',{exact:true})).toBeVisible();
    await expect(page.getByText('115 / 396 首',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'8 GB',exact:true})).toHaveCount(0);
    await expect(page.getByText('音频空间上限',{exact:true})).toHaveCount(0);
    await expect(page.getByText('待缓存歌曲 1',{exact:true})).toHaveCount(0);
    await page.getByLabel('播放歌单时自动预缓存',{exact:true}).selectOption('all');
    await expect(page.getByLabel('播放歌单时自动预缓存',{exact:true})).toHaveValue('all');
    await page.getByLabel('仅 Wi-Fi 缓存',{exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__cacheRequests.some((r:any)=>r.action==='configure'&&r.wifiOnly===false))).toBe(true);
    await expect(page.getByText('歌曲缓存已关闭',{exact:false})).toHaveCount(0);
    await expect(page.getByRole('status').filter({hasText:'优先使用本机完整音频缓存分析；其他歌曲等待缓存完成。'})).toBeVisible();
    await page.getByRole('button',{name:'原平台优先',exact:true}).click();
    await expect(page.getByRole('button',{name:'原平台优先',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tingyu_lx_sources_v1')!).policy.routing)).toBe('original-first');
    await page.evaluate(async()=>{
        const source='/src/services/nativeSettingsSemantic.ts';
        const {captureSemanticSettings}=await import(/* @vite-ignore */source);
        const capture=captureSemanticSettings(document.querySelector('main')!,'qa','设置');
        const node=capture.document.flow!.nodes.find((n:{title:string})=>n.title==='优先使用自定义音源')!;
        capture.actions[`act:${node.id}`]({});
    });
    await expect(page.getByRole('button',{name:'优先使用自定义音源',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.locator('.ty-lx-routing').screenshot({path:`C:/Users/DELL/Documents/Codex/2026-11-10/hze/outputs/cache1548-routing-${width}.png`});
    await page.getByRole('heading',{name:'离线缓存',exact:true}).scrollIntoViewIfNeeded();
    await page.locator('.resource-card').screenshot({path:`C:/Users/DELL/Documents/Codex/2026-11-10/hze/outputs/cache1548-settings-${width}.png`});
    await page.getByRole('button',{name:'查看任务',exact:true}).click();
    await expect(page.getByText('待缓存歌曲 1',{exact:true})).toBeVisible();
    await expect(page.getByText('待缓存歌曲 21',{exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'下一页',exact:true}).click();
    await expect(page.getByText('待缓存歌曲 21',{exact:true})).toBeVisible();
    await expect(page.getByText('待缓存歌曲 1',{exact:true})).toHaveCount(0);
    await page.getByRole('dialog',{name:'查看任务',exact:true}).getByRole('combobox').nth(1).selectOption('failed');
    await expect(page.getByText('失败歌曲 1',{exact:true})).toBeVisible();
    await page.getByText('失败歌曲 1',{exact:true}).click();
    await expect(page.getByText('下载超时，请检查网络后重试',{exact:true})).toBeVisible();
    await page.screenshot({path:`C:/Users/DELL/Documents/Codex/2026-11-10/hze/outputs/cache1548-tasks-${width}.png`});
    expect(errors).toEqual([]);
});

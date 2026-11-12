import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

// Actual rear editor and Compose semantic callbacks; browser checks do not imply device validation.
async function semantic(page:Page,actionTitle?:string){
    return page.evaluate(async title=>{
        const module='/src/services/nativeSettingsSemantic.ts';
        const m=await import(/* @vite-ignore */module);
        const result=m.captureSemanticSettings(document.querySelector('[data-mobile-settings]'),'rear','Rear');
        if(title){
            const node=result.document.flow.nodes.find((n:any)=>n.title===title && ['switch','action'].includes(n.kind));
            if(!node)throw new Error('Missing control '+title);
            const prefix=node.kind==='switch'?'set':'act';
            result.actions[prefix+':'+node.id](node.kind==='switch'?{text:node.value==='1'?'0':'1',value:0}:{});
        }
        return result.document.flow;
    },actionTitle);
}

for(const mode of ['nebbia','machi'])test(mode+' rear editor keeps actual renderer, settings and native touch targets',async({page,mount})=>{
    await page.setViewportSize({width:393,height:852});await mount('rearControl');
    await page.evaluate(()=>(window as any).__rearFixture('lsp',true));
    await page.locator('.ty-rear-entry').click();await page.getByRole('button',{name:/歌词舞台外观/}).click();
    await expect(page.getByRole('switch',{name:'独立配置背屏歌词舞台',exact:true})).toBeVisible();
    await expect(page.getByRole('switch',{name:'独立配置背屏歌词舞台',exact:true})).toBeEnabled();
    await semantic(page,'独立配置背屏歌词舞台');
    await expect(page.getByRole('switch',{name:'独立配置背屏歌词舞台',exact:true})).toHaveAttribute('aria-checked','true');
    await page.getByRole('button',{name:/舞台样式与字体/}).click();
    const label=mode==='machi'?'町景':'雾笺';
    await page.getByRole('button',{name:'歌词动画',exact:true}).click();
    await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
    await semantic(page,label);
    const preview=page.locator('[data-folia-stage-preview]');
    const bounds=(await preview.boundingBox())!;expect(bounds.width/bounds.height).toBeCloseTo(976/596,1);
    const choice=mode==='machi'?'加油站':'梦海流萤';
    await expect(page.getByRole('button',{name:choice,exact:true})).toBeVisible({timeout:40000});
    // The production native-first build supplies this marker; this shared browser probe keeps DOM visible.
    await preview.evaluate(el=>el.setAttribute('data-native-live','true'));
    const doc=await semantic(page);
    const nodes:any[]=[];const walk=(node:any)=>{nodes.push(node);node.children?.forEach(walk);};walk(doc.layout);
    expect(nodes.some(n=>n.style?.preview==='rear-stage')).toBe(true);
    const control=doc.nodes.find((n:any)=>n.title===choice)!;
    const layout=nodes.find(n=>n.ref===control.id)!;
    expect(layout.style).toMatchObject({minHeight:44,radius:12,fill:true,center:true});
    await semantic(page,choice);
    await expect.poll(()=>page.evaluate(({mode})=>(window as any).__rearAppearance().profile.visual.visualizerTunings[mode][mode==='machi'?'scene':'behind'],{mode})).toBe(mode==='machi'?'station':'aquarium');
    // Drive the same measured viewport packet supplied by Compose; renderer observes the new size.
    await page.evaluate(async()=>{
        const module='/src/services/nativeSettingsSemantic.ts',m=await import(/* @vite-ignore */module);
        const result=m.captureSemanticSettings(document.querySelector('[data-mobile-settings]'),'rear','Rear');
        const node=result.document.flow.nodes.find((n:any)=>n.kind==='preview');
        result.actions['preview:'+node.id]({text:JSON.stringify({x:16,y:100,w:361,h:361*596/976,top:0,bottom:0})});
    });
    await expect(preview.locator(mode==='machi'?'[data-machi-ready="true"]':'[data-nebbia-ready="true"]')).toBeVisible({timeout:40000});
    expect((await preview.boundingBox())!.width/(await preview.boundingBox())!.height).toBeCloseTo(976/596,2);
    await expect.poll(()=>page.evaluate(()=>(window as any).__rearAppearance().profile.visual.visualizerMode)).toBe(mode);
    // Repeat mode switches; separate overrides survive without leaking into front-screen tuning.
    await semantic(page,mode==='machi'?'雾笺':'町景');await semantic(page,label);
    await expect(page.getByRole('button',{name:choice,exact:true})).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>(window as any).__rearCalls)).toEqual([]);
});

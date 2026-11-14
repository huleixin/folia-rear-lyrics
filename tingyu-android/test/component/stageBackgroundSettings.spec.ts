import { test, expect } from "./fixtures";

// Simulated SAF only; React change handlers, Capacitor proxy, asset store and IndexedDB are real.
test.use({viewport:{width:393,height:852}});
test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        const state={cancelled:false,chunks:[] as number[],released:0};
        (window as any).__picker=state;
        const canvas=document.createElement("canvas");canvas.width=320;canvas.height=320;
        const ctx=canvas.getContext("2d")!,pixels=ctx.createImageData(320,320);let seed=17;
        for(let n=0;n<pixels.data.length;n++) {seed=(Math.imul(seed,1664525)+1013904223)|0;pixels.data[n]=n%4===3?255:seed>>>24;}
        ctx.putImageData(pixels,0,0);
        const raw=atob(canvas.toDataURL("image/png").split(",")[1]);
        (window as any).androidBridge={};
        (window as any).Capacitor={
            PluginHeaders:[{name:"FoliaNative",methods:["pickSettingsFiles","readSettingsFileChunk","releaseSettingsFiles"].map(name=>({name,rtype:"promise"}))}],
            nativePromise:async (_plugin:string,method:string,options:any) => {
                if(method==="pickSettingsFiles")return state.cancelled?{cancelled:true}:{files:[{id:"image",name:"background.png",mimeType:"image/png",size:raw.length}]};
                if(method==="readSettingsFileChunk") {state.chunks.push(options.offset);return {base64:btoa(raw.slice(options.offset,options.offset+options.length)),length:options.length};}
                if(method==="releaseSettingsFiles") {state.released++;return {};}
                throw new Error("Unexpected native call");
            }
        };
    });
    await page.route("**/*",route=>["localhost","127.0.0.1"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
});

async function selectedStates(page: import("@playwright/test").Page,card:string): Promise<{title:string;selected:boolean}[]> {
    return page.evaluate(async card => {
        const modulePath="/src/services/nativeSettingsSemantic.ts";
        const {captureSemanticSettings}=await import(/* @vite-ignore */ modulePath);
        const result=captureSemanticSettings(document.querySelector(`[data-testid="${card}"]`)!,"test","settings");
        return result.document.flow.nodes.filter((n:any)=>n.kind==="action").map((n:any)=>({title:n.title,selected:n.detail==="✓"}));
    },card);
}
async function nativeAction(page: import("@playwright/test").Page,card:string,label:string) {
    await page.evaluate(async ({card,label}) => {
        document.documentElement.dataset.nativeSettingsDocument="true";
        const path="/src/services/nativeSettingsSemantic.ts";const {captureSemanticSettings}=await import(/* @vite-ignore */ path);
        const result=captureSemanticSettings(document.querySelector(`[data-testid="${card}"]`)!,"test","settings");
        const node=result.document.flow.nodes.find((n:any)=>n.kind==="action"&&n.title===label);
        if(!node)throw new Error(`Missing action ${label}`);
        result.actions[`act:${node.id}`]({});
    },{card,label});
}

for(const card of ["monet","nomand"])test(`${card}: native image upload selects custom source, renders and survives reload`,async ({page,mount}) => {
    const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    await mount("stageBackgroundSettings");
    await expect(page.getByTestId(card).getByRole("button",{name:"options.monetUploadBackground",exact:true})).toBeEnabled();
    await nativeAction(page,card,"options.monetUploadBackground");
    const image=page.getByTestId("uploaded-image");
    await expect(image).toBeVisible();
    await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth)).toBe(320);
    await expect.poll(async ()=>(await selectedStates(page,card)).find(n=>n.title==="options.monetBackgroundSourceUploaded")?.selected).toBe(true);
    expect((await selectedStates(page,card)).find(n=>n.title==="options.monetBackgroundSourceCover")?.selected).toBe(false);
    const state=await page.evaluate(async () => {
        const path="/src/services/monetBackgroundImage.ts";const {getMonetBackgroundImage}=await import(/* @vite-ignore */ path);
        const stored=await getMonetBackgroundImage();return {size:stored.blob.size,name:stored.name,...(window as any).__picker};
    });
    expect(state.size).toBeGreaterThan(262144);expect(state.name).toBe("background.png");
    expect(state.chunks).toEqual([0,262144]);expect(state.released).toBe(1);
    if(card==="monet") {
        await expect.poll(()=>page.getByTestId("preview").evaluate(el=>Array.from(el.querySelectorAll<HTMLElement>("div")).some(d=>d.style.backgroundImage.includes("url(")))).toBe(true);
    }
    const original=await image.getAttribute("src");
    await page.evaluate(()=>(window as any).__picker.cancelled=true);
    await nativeAction(page,card,"options.monetUploadBackground");
    await expect(image).toHaveAttribute("src",original!);
    // The shared fixture deliberately clears localStorage on every navigation. Restore the
    // saved preferences after its seed so this navigation represents an actual app restart.
    const preferences=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)!])));
    await page.addInitScript(preferences=>Object.entries(preferences).forEach(([key,value])=>localStorage.setItem(key,value)),preferences);
    await page.reload();await mount("stageBackgroundSettings");
    await expect.poll(()=>page.getByTestId("uploaded-image").evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth)).toBe(320);
    await expect.poll(async ()=>(await selectedStates(page,card)).find(n=>n.title==="options.monetBackgroundSourceUploaded")?.selected).toBe(true);
    expect(errors).toEqual([]);
});

test("background choices send exactly one selected value per group to Compose",async ({page,mount}) => {
    await mount("stageBackgroundSettings");
    for(const card of ["monet","latent","nomand"]) {
        const groups=await page.getByTestId(card).evaluate(el=>Array.from(el.querySelectorAll("button[aria-pressed]")).map(button=>{
            const parent=button.parentElement!;return Array.from(parent.querySelectorAll("button[aria-pressed]")).map(b=>b.textContent!.trim());
        }));
        const distinct=Array.from(new Map(groups.filter(group=>group.length>1&&group.every(Boolean)).map(group=>[group.join("|"),group])).values());
        for(const group of distinct) {
            for(const choice of [...group.slice(1),group[0]]) {
                const buttons=page.getByTestId(card).getByRole("button",{name:choice,exact:true});
                if(await buttons.isDisabled())continue;
                await nativeAction(page,card,choice);
                await expect.poll(async ()=>(await selectedStates(page,card)).filter(n=>group.includes(n.title)&&n.selected).map(n=>n.title)).toEqual([choice]);
            }
        }
    }
});

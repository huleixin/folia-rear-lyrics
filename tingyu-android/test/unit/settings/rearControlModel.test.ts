import {expect,it} from 'vitest';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en';
import ind from '@/i18n/locales/in';
import {buildRearControlPage,rearModeLocked,rearRunLabel,rearPageKey,rearPageBack,type RearPresentation} from '@/components/modal/settings/rearControlModel';
import {rearSettingsFingerprint} from '@/components/modal/settings/rearLyricsSettingsModel';

// test/unit/settings/rearControlModel.test.ts
const t=(key:string)=>key.split('.').reduce<any>((node,part)=>node?.[part],zh)??key;
it('resolves every visible control/advanced translation in all supported languages',()=>{
    for(const locale of [zh,en,ind])for(const page of ['control','advanced'] as const)for(const backendMode of ['lsp','shizuku'] as const){
        const checked=(key:string,values?:Record<string,unknown>)=>{
            // Indonesian intentionally uses the app's existing English/Chinese fallbacks.
            const read=(resource:object)=>key.split('.').reduce<any>((node,part)=>node?.[part],resource);
            const value=read(locale)??read(en)??read(zh);
            expect(typeof value,`Missing ${key}`).toBe('string');
            return String(value).replace(/\{\{(\w+)\}\}/g,(_,name)=>String(values?.[name]??''));
        };
        buildRearControlPage(page,{available:true,busy:false,failed:false,actionFailed:false,snapshot:{backendMode,rearDisplayId:1}},checked);
    }
});
const state:RearPresentation={available:true,busy:false,failed:false,actionFailed:false,snapshot:{backendMode:'lsp',lspConnected:true,enabled:true,active:false,rearDisplayId:1,controlEngine:'legacy'}};
it('separates module connection, persisted preference and actual display activity',()=>{
    const page=buildRearControlPage('control',state,t),rows=page.sections.find(s=>s.id==='rear-status')!.items!;
    expect(rows.find(r=>r.id==='module')!.subtitle).toBe('已连接');expect(rows.find(r=>r.id==='preference')!.subtitle).toBe('已启用');expect(rows.find(r=>r.id==='display')!.subtitle).toContain('等待显示确认');
    expect(JSON.stringify(page)).not.toContain('Shizuku 服务');expect(JSON.stringify(page)).not.toContain('Legacy');
});
it.each([[false,false,'未启动'],[true,false,'未授权'],[true,true,'已授权']])('Shizuku service %s and permission %s never imply an active display', (service,permission,label)=>{
    const page=buildRearControlPage('control',{...state,snapshot:{backendMode:'shizuku',shizukuAvailable:service,authorized:permission,enabled:false,active:false}},t);
    const rows=page.sections.find(s=>s.id==='rear-status')!.items!;
    expect(rows.find(r=>r.id==='permission')!.subtitle).toBe(label);expect(rows.find(r=>r.id==='display')!.subtitle).toBe('未开启');expect(rows.some(r=>r.id==='module')).toBe(false);
});
it('keeps rollback in advanced and restricts locked routes to Shizuku',()=>{
    const lsp=buildRearControlPage('advanced',state,t);expect(lsp.sections.some(s=>s.id==='engine'||s.id==='rear-sleep')).toBe(false);expect(lsp.sections.find(s=>s.id==='rear-aod')!.items![0].selected).toBe(true);expect(lsp.sections.some(s=>s.id==='route')).toBe(false);
    const shizuku=buildRearControlPage('advanced',{...state,snapshot:{...state.snapshot,backendMode:'shizuku',lockedRoute:'reuse'}},t);
    expect(shizuku.sections.find(s=>s.id==='route')!.items!.map(r=>r.id)).toEqual(['auto','reuse','migrate']);expect(shizuku.sections.find(s=>s.id==='route')!.text).toMatch(/锁屏.*系统.*限制/);
});
it.each(['enabled','starting','sleeping','active'] as const)('locks backend and engine while %s without firing an action',key=>{
    const snapshot={enabled:false,starting:false,sleeping:false,active:false,[key]:true};expect(rearModeLocked(snapshot,false)).toBe(true);
    expect(buildRearControlPage('control',{...state,snapshot},t).sections.find(s=>s.id==='backend')!.items!.every(r=>r.disabled)).toBe(true);
});
it('marks unknown fields as unknown and allows turning off a known preference during a query failure',()=>{
    const pending=buildRearControlPage('control',{...state,snapshot:null},t);expect(pending.sections.find(s=>s.id==='backend')!.items!.some(r=>r.selected)).toBe(false);
    expect(pending.sections.find(s=>s.id==='rear-status')!.items!.find(r=>r.id==='permission')!.subtitle).toBe('检测中');
    expect(buildRearControlPage('control',{...state,failed:true},t).sections[0].items![0].disabled).toBe(false);
});
it('sensor/power limits are real and an existing preference can still be disabled',()=>{
    for(const enabled of [false,true]){const row=buildRearControlPage('advanced',{...state,snapshot:{coverSleepEnabled:enabled,sensorAvailable:false,sleepUnsupported:true}},t).sections.find(s=>s.id==='rear-sleep')!.items![0];expect(row.disabled).toBe(!enabled);}
    expect(rearRunLabel({cameraSuspended:true,enabled:true},false,t)).toContain('相机');
});
it('includes every editable/readable UI fact in the existing fingerprint without diagnostic timestamps',()=>{
    const before={...state.snapshot};
    for(const [key,value] of Object.entries({lockedRoute:'migrate',coverSleepEnabled:true,sensorAvailable:true,sleepUnsupported:true,cameraSuspended:true,message:'failed'}))expect(rearSettingsFingerprint(before)).not.toBe(rearSettingsFingerprint({...before,[key]:value}));
    expect(rearSettingsFingerprint({...before,diagnostics:'t1'})).toBe(rearSettingsFingerprint({...before,diagnostics:'t2'}));
});
it('routes have separate identities with an explicit shallow return path',()=>{
    expect(rearPageKey('control')).toBe('settings:rear:control');expect(rearPageKey('advanced')).toBe('settings:rear:advanced');expect(rearPageKey('diagnostics')).toBe('settings:document:rear-diagnostics');
    expect(rearPageBack('control')).toBe('index');for(const page of ['advanced','guide','diagnostics'] as const)expect(rearPageBack(page)).toBe('control');
});

it('shows actual host ownership separately from module connection and keeps re-entry reachable',()=>{
    const page=buildRearControlPage('control',{...state,snapshot:{...state.snapshot,enabled:true,active:false,hostConnected:true,hostActive:false,userDismissed:true,returnedToSystem:true,displayMode:'system-card'}},t);
    expect(page.sections.find(s=>s.id==='rear-show')?.items?.[0].action).toBe('rear:show');
    expect(page.sections.find(s=>s.id==='rear-status')?.items?.find(i=>i.id==='host')?.subtitle).not.toContain('已接管');
});

it('exposes LSP card AOD and keep-awake as independent preferences and permits disabling after a lost framework connection',()=>{
    const model=(snapshot:object)=>buildRearControlPage('advanced',{...state,snapshot:{backendMode:'lsp',...snapshot}},t);
    const card=model({nativeCardAod:false,nativeCardKeepAwake:true,nativeCardKeepAwakeAvailable:false}).sections.find(s=>s.id==='rear-aod')!.items!;
    expect(card.find(r=>r.id==='aod')?.selected).toBe(false);
    expect(card.find(r=>r.id==='keep-awake')).toMatchObject({selected:true,disabled:false,action:'rear:keep-awake'});
    expect(model({nativeCardKeepAwake:false,nativeCardKeepAwakeAvailable:false}).sections.find(s=>s.id==='rear-aod')!.items!.find(r=>r.id==='keep-awake')?.disabled).toBe(true);
    expect(model({nativeCardKeepAwakeAvailable:true}).sections.find(s=>s.id==='rear-aod')!.items!.find(r=>r.id==='keep-awake')?.disabled).toBe(false);
    const before={backendMode:'lsp' as const,nativeCardAod:true};
    expect(rearSettingsFingerprint(before)).not.toBe(rearSettingsFingerprint({...before,nativeCardAod:false}));
    expect(rearSettingsFingerprint(before)).not.toBe(rearSettingsFingerprint({...before,nativeCardKeepAwake:true}));
});

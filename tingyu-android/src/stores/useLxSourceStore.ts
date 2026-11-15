import { create } from 'zustand';
import { validateRemoteUrl, type LxScript } from '../services/lxSource/contract';

// src/stores/useLxSourceStore.ts
const KEY = 'tingyu_lx_sources_v1';
export interface LxPolicy { autoDowngrade: boolean; autoSwitch: boolean; retries: number; priority: string[]; preferredSource: string | null; routing: 'lx-first' | 'original-first'; scriptFallback: boolean; scriptOrder: string[] }
export const DEFAULT_LX_POLICY: LxPolicy = {autoDowngrade:true, autoSwitch:true, retries:0, priority:['kw','tx','wy','kg','mg'], preferredSource:null, routing:'lx-first', scriptFallback:false, scriptOrder:[]};
export function normalizeLxPolicy(value:Partial<LxPolicy>|null|undefined, ids:string[]):LxPolicy {
    const v=value??{}, sources=['kw','tx','wy','kg','mg'];
    const priority=Array.isArray(v.priority)?v.priority.filter(x=>sources.includes(x)):sources;
    return {...DEFAULT_LX_POLICY,autoDowngrade:v.autoDowngrade!==false,autoSwitch:v.autoSwitch!==false,
        retries:Math.min(1,Math.max(0,Math.floor(Number(v.retries)||0))),routing:v.routing==='original-first'?'original-first':'lx-first',
        preferredSource:typeof v.preferredSource==='string'&&sources.includes(v.preferredSource)?v.preferredSource:null,
        priority:[...new Set([...priority,...sources])],scriptFallback:v.scriptFallback===true,
        scriptOrder:Array.isArray(v.scriptOrder)?[...new Set(v.scriptOrder.filter(x=>typeof x==='string'&&ids.includes(x)))]:[]};
}
function read() {
    try {
        const value=JSON.parse(localStorage.getItem(KEY)||'{}');
        const scripts: LxScript[]=Array.isArray(value.scripts)?value.scripts.slice(0,8).filter((s:LxScript)=>s&&typeof s.id==='string'&&typeof s.name==='string'&&typeof s.code==='string'&&s.code.length<=1048576&&s.capabilities&&typeof s.capabilities==='object'):[];
        const activeId=scripts.some(s=>s.id===value.activeId)?value.activeId as string:null;
        // Migrate only active installations; new and inactive installations stay off.
        const extensionEnabled=typeof value.extensionEnabled==='boolean'?value.extensionEnabled:!!activeId;
        return {scripts,activeId,extensionEnabled,riskAccepted:value.riskAccepted===true||extensionEnabled,revision:Number.isSafeInteger(value.revision)?value.revision:0,policy:normalizeLxPolicy(value.policy,scripts.map(s=>s.id))};
    }catch{return {scripts:[] as LxScript[],activeId:null,extensionEnabled:false,riskAccepted:false,revision:0,policy:DEFAULT_LX_POLICY};}
}
export type LxImportPermit = Readonly<{ kind: 'lx-import' }>;
type Consent = {kind:'enable'|'import';checked:boolean};
const permits=new WeakMap<LxImportPermit,number>();
let permitEpoch=0;
let consentResult:((value:LxImportPermit|boolean|null)=>void)|null=null;
export function assertLxImportPermit(permit:LxImportPermit) {
    if(!useLxSourceStore.getState().extensionEnabled||permits.get(permit)!==permitEpoch)throw Error('请重新确认实验性功能风险');
}
export const useLxSourceStore=create<{
    scripts:LxScript[];activeId:string|null;open:boolean;revision:number;policy:LxPolicy;
    extensionEnabled:boolean;riskAccepted:boolean;consent:Consent|null;
    setExtensionEnabled:(enabled:boolean)=>Promise<boolean>;requestImport:()=>Promise<LxImportPermit|null>;
    revokeImport:(permit:LxImportPermit)=>void;
    setConsentChecked:(checked:boolean)=>void;confirmConsent:()=>void;cancelConsent:()=>void;
    show:()=>void;close:()=>void;save:(script:LxScript,permit?:LxImportPermit)=>string;rollback:(id:string)=>void;
    activate:(id:string|null)=>void;remove:(id:string)=>void;setPolicy:(value:Partial<LxPolicy>)=>void;
    setImportUrl:(id:string,url:string)=>void;
}>((set,get)=>{
    const persist=(scripts:LxScript[],activeId:string|null,policy=get().policy,extensionEnabled=get().extensionEnabled,riskAccepted=get().riskAccepted)=>{
        const revision=get().revision+1;
        localStorage.setItem(KEY,JSON.stringify({scripts,activeId,revision,policy,extensionEnabled,riskAccepted}));
        set({scripts,activeId,revision,policy,extensionEnabled,riskAccepted});
    };
    const cancel=()=>{const resolve=consentResult;consentResult=null;set({consent:null});resolve?.(null);};
    const request=(kind:Consent['kind'])=>{cancel();return new Promise<LxImportPermit|boolean|null>(resolve=>{consentResult=resolve;set({consent:{kind,checked:false}});});};
    return {...read(),open:false,consent:null,
        setExtensionEnabled:async enabled=>{
            if(enabled===get().extensionEnabled){if(!enabled)cancel();return enabled;}
            if(enabled&&!get().riskAccepted)return (await request('enable'))===true;
            persist(get().scripts,get().activeId,get().policy,enabled);
            if(!enabled){permitEpoch++;cancel();set({open:false});}
            return enabled;
        },
        requestImport:async()=>get().extensionEnabled?(await request('import')) as LxImportPermit|null:null,
        revokeImport:permit=>{permits.delete(permit);},
        setConsentChecked:checked=>{const consent=get().consent;if(consent)set({consent:{...consent,checked}});},
        confirmConsent:()=>{
            const consent=get().consent;if(!consent?.checked)return;
            if(consent.kind==='import'&&!get().extensionEnabled){cancel();return;}
            if(consent.kind==='enable')persist(get().scripts,get().activeId,get().policy,true,true);
            const permit:LxImportPermit=Object.freeze({kind:'lx-import'});
            if(consent.kind==='import')permits.set(permit,permitEpoch);
            const resolve=consentResult;consentResult=null;set({consent:null});resolve?.(consent.kind==='enable'?true:permit);
        },cancelConsent:cancel,
        show:()=>{if(get().extensionEnabled)set({open:true});},close:()=>{permitEpoch++;if(get().consent?.kind==='import')cancel();set({open:false});},
        save:(script,permit)=>{
            const old=get().scripts.find(s=>s.id===script.id)||get().scripts.find(s=>s.name===script.name);
            if(!get().extensionEnabled)throw Error('第三方音源扩展已关闭');
            if(!old||old.code!==script.code){if(!permit)throw Error('请先确认实验性功能风险');assertLxImportPermit(permit);}
            const previous=old&&old.code!==script.code?{...old,previous:undefined}:old?.previous;
            const next={...script,id:old?.id??script.id,importUrl:script.importUrl??old?.importUrl,previous};
            const scripts=old?get().scripts.map(s=>s.id===old.id?next:s):[...get().scripts,next];
            if(scripts.length>8)throw Error('最多保存 8 个音源');
            persist(scripts,get().activeId);if(permit)permits.delete(permit);return next.id;
        },
        rollback:id=>{if(!get().extensionEnabled)throw Error('第三方音源扩展已关闭');const old=get().scripts.find(s=>s.id===id);if(!old?.previous)throw Error('没有可回退版本');persist(get().scripts.map(s=>s.id===id?{...old.previous!,id}:s),get().activeId);},
        activate:id=>{if(id&&!get().extensionEnabled)throw Error('第三方音源扩展已关闭');persist(get().scripts,id&&get().scripts.some(s=>s.id===id)?id:null);},
        remove:id=>persist(get().scripts.filter(s=>s.id!==id),get().activeId===id?null:get().activeId),
        setImportUrl:(id,url)=>{if(!get().extensionEnabled)throw Error('第三方音源扩展已关闭');const script=get().scripts.find(s=>s.id===id);if(!script)throw Error('音源不存在');const next=url.trim();persist(get().scripts.map(s=>s.id===id?{...s,importUrl:next?validateRemoteUrl(next):undefined}:s),get().activeId);},
        setPolicy:value=>{if(!get().extensionEnabled)throw Error('第三方音源扩展已关闭');persist(get().scripts,get().activeId,normalizeLxPolicy({...get().policy,...value},get().scripts.map(s=>s.id)));},
    };
});

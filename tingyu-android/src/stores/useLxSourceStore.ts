import { create } from 'zustand';
import { validateRemoteUrl, type LxScript } from '../services/lxSource/contract';

// src/stores/useLxSourceStore.ts
const KEY = 'tingyu_lx_sources_v1';
export interface LxPolicy { autoDowngrade: boolean; autoSwitch: boolean; retries: number; priority: string[]; preferredSource: string | null }
export const DEFAULT_LX_POLICY: LxPolicy = {autoDowngrade:true, autoSwitch:true, retries:0, priority:['kw','tx','wy','kg','mg'], preferredSource:null};
function read() {
    try {
        const value=JSON.parse(localStorage.getItem(KEY)||'{}');
        const scripts: LxScript[]=Array.isArray(value.scripts)?value.scripts.slice(0,8).filter((s:LxScript)=>typeof s.id==='string'&&typeof s.name==='string'&&typeof s.code==='string'&&s.code.length<=1048576&&s.capabilities&&typeof s.capabilities==='object'):[];
        return {scripts,activeId:scripts.some(s=>s.id===value.activeId)?value.activeId as string:null,revision:Number.isSafeInteger(value.revision)?value.revision:0,policy:{...DEFAULT_LX_POLICY,...value.policy} as LxPolicy};
    }catch{return {scripts:[] as LxScript[],activeId:null,revision:0,policy:DEFAULT_LX_POLICY};}
}
export const useLxSourceStore=create<{
    scripts:LxScript[];activeId:string|null;open:boolean;revision:number;policy:LxPolicy;
    show:()=>void;close:()=>void;save:(script:LxScript)=>string;rollback:(id:string)=>void;
    activate:(id:string|null)=>void;remove:(id:string)=>void;setPolicy:(value:Partial<LxPolicy>)=>void;
    setImportUrl:(id:string,url:string)=>void;
}>((set,get)=>{
    const persist=(scripts:LxScript[],activeId:string|null,policy=get().policy)=>{
        const revision=get().revision+1;
        localStorage.setItem(KEY,JSON.stringify({scripts,activeId,revision,policy}));
        set({scripts,activeId,revision,policy});
    };
    return {...read(),open:false,show:()=>set({open:true}),close:()=>set({open:false}),
        save:script=>{
            const old=get().scripts.find(s=>s.id===script.id)||get().scripts.find(s=>s.name===script.name);
            const previous=old&&old.code!==script.code?{...old,previous:undefined}:old?.previous;
            const next={...script,id:old?.id??script.id,importUrl:script.importUrl??old?.importUrl,previous};
            const scripts=old?get().scripts.map(s=>s.id===old.id?next:s):[...get().scripts,next];
            if(scripts.length>8)throw Error('最多保存 8 个音源');
            persist(scripts,get().activeId);return next.id;
        },
        rollback:id=>{const old=get().scripts.find(s=>s.id===id);if(!old?.previous)throw Error('没有可回退版本');persist(get().scripts.map(s=>s.id===id?{...old.previous!,id}:s),get().activeId);},
        activate:id=>persist(get().scripts,id&&get().scripts.some(s=>s.id===id)?id:null),
        remove:id=>persist(get().scripts.filter(s=>s.id!==id),get().activeId===id?null:get().activeId),
        setImportUrl:(id,url)=>{const script=get().scripts.find(s=>s.id===id);if(!script)throw Error('音源不存在');const next=url.trim();persist(get().scripts.map(s=>s.id===id?{...s,importUrl:next?validateRemoteUrl(next):undefined}:s),get().activeId);},
        setPolicy:value=>{const next={...get().policy,...value};next.retries=Math.min(1,Math.max(0,Math.floor(Number(next.retries)||0)));if(next.preferredSource&&!['kw','tx','wy','kg','mg'].includes(next.preferredSource))next.preferredSource=null;next.priority=[...new Set(next.priority.filter(s=>['kw','tx','wy','kg','mg'].includes(s)))];persist(get().scripts,get().activeId,next);},
    };
});

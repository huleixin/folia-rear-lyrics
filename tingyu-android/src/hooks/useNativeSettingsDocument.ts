import { useLayoutEffect,useState,type RefObject } from 'react';
import { equalNativeData } from '../utils/nativePacketData';
import { isVisualOnlyStyleMutation } from '../utils/nativeSettingsMutations';
import { NATIVE_FIRST } from '../services/nativePages';
import { captureSettingsDocument } from '../services/nativeSettingsDocument';
import { useNativePage } from './useNativePage';
import type { NativeSettingsDocument, NativeSettingsFlow } from '../types/nativeSettingsDocument';
import type { PageActions } from '../types/nativePages';
import { flushNativeShellRoute } from '../services/nativeShellCommit';

// src/hooks/useNativeSettingsDocument.ts
// Observe discrete form/layout edits only. Preview engine mutations never rebuild the form.
/**
 * @param flow 语义化设置页（原生化专项·第 21 轮）。传了就由 Compose 用原生控件排版，
 *   不再依赖 DOM 测量；不传则维持逐元素测量的显示列表（逐像素与改造前一致）。
 *   两种模式可并存于不同分区 —— 迁移是逐页的。
 */
export function useNativeSettingsDocument(root:RefObject<HTMLElement|null>,enabled:boolean,key:string,title:string,
    flow?:NativeSettingsFlow|null,
    onFlowAction?:(nodeId:string,event:{text?:string;value?:number})=>void){
    const [snapshot,setSnapshot]=useState<{key:string;document:NativeSettingsDocument;actions:PageActions}>();
    useLayoutEffect(()=>{
        const element=root.current;if(!NATIVE_FIRST||!enabled||!element)return;
        element.dataset.nativePage='true';element.dataset.nativeDocumentRoot='true';
        element.dataset.nativeSettingsKey=`settings:document:${key}`;
        flushNativeShellRoute();
        window.document.documentElement.dataset.nativeSettingsDocument='true';
        let timer=0,disposed=false,last:NativeSettingsDocument|undefined;
        const capture=()=>{timer=0;if(disposed)return;const snapshot=captureSettingsDocument(element);
            if(!equalNativeData(last,snapshot.document)){last=snapshot.document;setSnapshot({key,document:snapshot.document,actions:snapshot.actions})}};
        const schedule=()=>{if(!timer)timer=window.setTimeout(capture,48)};
        const mutation=new MutationObserver(records=>{if(records.some(record=>{
            const target=record.target instanceof Element?record.target:record.target.parentElement;
            // Reject preview animation traffic before parsing inline styles or walking portals.
            if(target?.closest('[data-native-live]'))return false;
            const belongs=target&&(element.contains(target)||target.closest('[data-native-settings-portal]'));
            const newPortal=record.type==='childList'&&[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&
                (node.matches('[data-folia-keyboard-window],[role="listbox"],[role="dialog"]')||node.querySelector('[data-folia-keyboard-window],[role="listbox"],[role="dialog"]')));
            if(!belongs&&!newPortal)return false;
            return !(record.type==='attributes'&&record.attributeName==='style'&&isVisualOnlyStyleMutation(record.oldValue,target?.getAttribute('style')??null));
        }))schedule()});
        mutation.observe(window.document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true,
            attributeFilter:['class','style','value','checked','disabled','aria-checked','aria-selected','aria-expanded','open']});
        const resize=new ResizeObserver(schedule);resize.observe(element);
        element.addEventListener('input',schedule);element.addEventListener('change',schedule);
        window.document.addEventListener('tingyu-native-form-scroll',schedule);
        const refresh=()=>{last=undefined;schedule()};
        window.document.addEventListener('tingyu-native-settings-refresh',refresh);
        window.document.addEventListener('tingyu-interface-appearance',schedule);
        const loaded=(event:Event)=>{const target=event.target;if(target instanceof Element&&!target.closest('[data-native-live]')&&(element.contains(target)||target.closest('[data-native-settings-portal]')))schedule()};
        window.addEventListener('resize',schedule);window.document.addEventListener('load',loaded,true);
        window.document.fonts.ready.then(()=>{if(!disposed)schedule()});capture();
        return()=>{disposed=true;clearTimeout(timer);mutation.disconnect();resize.disconnect();
            element.removeEventListener('input',schedule);element.removeEventListener('change',schedule);
            window.document.removeEventListener('tingyu-native-form-scroll',schedule);
            window.document.removeEventListener('tingyu-native-settings-refresh',refresh);
            window.document.removeEventListener('tingyu-interface-appearance',schedule);
            window.removeEventListener('resize',schedule);window.document.removeEventListener('load',loaded,true);
            delete window.document.documentElement.dataset.nativeSettingsDocument;
            delete element.dataset.nativeDocumentRoot;
            delete element.dataset.nativeSettingsKey;
            window.document.querySelectorAll<HTMLElement>('[data-native-live-carrier]').forEach(carrier=>delete carrier.dataset.nativeLiveCarrier);
            window.document.querySelectorAll<HTMLElement>('[data-native-settings-portal]').forEach(portal=>{delete portal.dataset.nativeSettingsPortal;delete portal.dataset.nativePage});
        };
    },[root,enabled,key]);
    // 语义化控件的动作名（与 Kotlin 侧 TySettingEvent 一一对应）。控件只报 id，
    // 具体写哪个 store 由调用方在 onFlowAction 里决定 —— 设置业务仍然只有一份。
    const flowHandlers:PageActions={};
    if(flow&&onFlowAction)for(const node of flow.nodes){
        const name=node.action||node.id;
        const prefix=node.kind==='switch'||node.kind==='select'?'set'
            :node.kind==='slider'?'slide':node.kind==='input'?'submit':'act';
        flowHandlers[`${prefix}:${name}`]=event=>onFlowAction(node.id,event);
    }
    const handlers:PageActions={...(snapshot?.key===key?snapshot.actions:{}),...flowHandlers};
    // flow 与测量结果同源同 key：两者一起换页，避免"新 flow + 旧矩形"的半新半旧状态。
    const document=snapshot?.key===key?{...snapshot.document,...(flow?{flow}:{})}:undefined;
    useNativePage(root,'settings',NATIVE_FIRST&&enabled,{key:`settings:document:${key}`,title,sections:[],document},handlers);
}

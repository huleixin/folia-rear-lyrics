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
//
// 两条路径（原生化专项·第 22 轮）：
//   A. 有 flow：语义化设置页。DOM 只作为状态宿主挂载（content-visibility:hidden），
//      **完全不测量**、不产生 paints/controls —— 排版全部由 Compose 决定。
//   B. 无 flow：原来的逐元素测量显示列表，逐像素与改造前一致。
// 两条路径按分区切换，互不影响；hasFlow 变化会让 effect 重建，各自清理自己的标记。

/** 语义化页面的空文档：没有一张画框、没有一个测量控件，只有 flow。 */
function flowOnlyDocument(flow: NativeSettingsFlow): NativeSettingsDocument {
    return { paints: [], controls: [], areas: [], live: [], flow };
}

/**
 * @param flow 语义化设置页。传了就由 Compose 用原生控件排版，不再依赖 DOM 测量；
 *   不传则维持逐元素测量的显示列表（逐像素与改造前一致）。
 * @param onFlowAction 语义化控件的动作回调，参数是该节点的 id 与值。
 * @param onFlowBack 原生顶栏/系统返回手势的返回动作。
 */
export function useNativeSettingsDocument(root:RefObject<HTMLElement|null>,enabled:boolean,key:string,title:string,
    flow?:NativeSettingsFlow|null,
    onFlowAction?:(nodeId:string,event:{text?:string;value?:number})=>void,
    onFlowBack?:()=>void){
    const [snapshot,setSnapshot]=useState<{key:string;document:NativeSettingsDocument;actions:PageActions}>();
    const hasFlow=Boolean(flow);
    useLayoutEffect(()=>{
        const element=root.current;if(!NATIVE_FIRST||!enabled||!element)return;
        element.dataset.nativePage='true';
        if(hasFlow){
            // 语义化页：DOM 不参与排版，也不该留下"文档根"标记（否则 CSS 会把它保持在
            // 可测量/可绘制状态，等于白留一棵可见的旧页面在原生页后面）。
            delete element.dataset.nativeDocumentRoot;
            delete element.dataset.nativeSettingsKey;
            delete window.document.documentElement.dataset.nativeSettingsDocument;
            flushNativeShellRoute();
            return;
        }
        element.dataset.nativeDocumentRoot='true';
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
    },[root,enabled,key,hasFlow]);
    const flowHandlers:PageActions={};
    if(flow&&onFlowAction){
        // 语义化控件的动作名（与 Kotlin 侧 TySettingEvent 一一对应）。控件只报 id，
        // 具体写哪个 store 由调用方在 onFlowAction 里决定 —— 设置业务仍然只有一份。
        for(const node of flow.nodes){
            const name=node.action||node.id;
            const prefix=node.kind==='switch'||node.kind==='select'?'set'
                :node.kind==='slider'?'slide':node.kind==='input'?'submit':'act';
            flowHandlers[`${prefix}:${name}`]=event=>onFlowAction(node.id,event);
        }
        // 页面级返回：原生顶栏的左箭头与系统返回手势都发这一个动作。
        if(onFlowBack)flowHandlers.back=()=>onFlowBack();
    }
    const handlers:PageActions=flow?flowHandlers:{...(snapshot?.key===key?snapshot.actions:{})};
    // 语义化页自带 document（只有 flow）；测量页用它自己那一份 snapshot。
    const document=flow?flowOnlyDocument(flow):(snapshot?.key===key?snapshot.document:undefined);
    useNativePage(root,'settings',NATIVE_FIRST&&enabled,{key:`settings:document:${key}`,title,sections:[],document},handlers);
}

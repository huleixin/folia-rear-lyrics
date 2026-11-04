import { useLayoutEffect,useState,type RefObject } from 'react';
import { equalNativeData } from '../utils/nativePacketData';
import { isVisualOnlyStyleMutation } from '../utils/nativeSettingsMutations';
import { NATIVE_FIRST } from '../services/nativePages';
import { captureSettingsDocument } from '../services/nativeSettingsDocument';
import { useNativePage } from './useNativePage';
import type { NativeSettingsDocument } from '../types/nativeSettingsDocument';
import type { PageActions } from '../types/nativePages';
import { flushNativeShellRoute } from '../services/nativeShellCommit';

// src/hooks/useNativeSettingsDocument.ts
// Observe discrete form/layout edits only. Preview engine mutations never rebuild the form.
export function useNativeSettingsDocument(root:RefObject<HTMLElement|null>,enabled:boolean,key:string,title:string){
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
    const handlers:PageActions=snapshot?.key===key?snapshot.actions:{};
    useNativePage(root,'settings',NATIVE_FIRST&&enabled,{key:`settings:document:${key}`,title,sections:[],document:snapshot?.key===key?snapshot.document:undefined},handlers);
}

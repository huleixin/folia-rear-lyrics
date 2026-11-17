import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNativeSettingsDocument } from '../../../hooks/useNativeSettingsDocument';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { useDiscoverySettingsStore } from '../../../stores/useDiscoverySettingsStore';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { discoverySources } from '../../../services/discovery/service';
import { clearDiscoveryPreferences } from '../../../services/discovery/preferences';
import { omni } from '../../../services/onlineMusic/omni';
import { runTopModalBack } from '../../../services/modalBackStack';
import OperationPanel from '../../shared/OperationPanel';
import { discoverySettingsModel, discoverySettingsPatch, resetDiscoveryLayout, resetDiscoveryParameters } from './discoverySettingsModel';

// src/components/modal/settings/DiscoverySettingsPage.tsx
export default function DiscoverySettingsPage({onClose}:{onClose:()=>void}) {
    useTranslation(); // Refresh presentation labels after a language change.
    const root=useRef<HTMLDivElement>(null),settings=useDiscoverySettingsStore();
    useOnlineProviderAccountStore(s=>s.accounts);
    useSyncExternalStore(omni.subscribeProviders,omni.getProviderRegistryVersion);
    const fromIndex=useSettingsModalStore(s=>s.settingsModalState.returnToIndex);
    const [confirm,setConfirm]=useState<string|null>(null);
    const back=()=>fromIndex?useSettingsModalStore.getState().returnSettingsToIndex():onClose();
    useEffect(()=>{
        const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){
            if(runTopModalBack())return;
            event.preventDefault();event.stopImmediatePropagation();back();
        }};
        window.addEventListener('keydown',onKey,true);
        return ()=>window.removeEventListener('keydown',onKey,true);
    },[fromIndex,onClose]);
    useNativeSettingsDocument(root,true,'discovery','推荐设置',discoverySettingsModel(settings,discoverySources()),(id,event)=>{
        if(['clear','resetLayout','resetParameters'].includes(id)){setConfirm(id);return;}
        if(id==='manageSources') {
            if(fromIndex)useSettingsModalStore.getState().openSettingsFromIndex('integration');
            else {onClose();document.dispatchEvent(new Event('tingyu-discovery-sources'));}
            return;
        }
        const patch=discoverySettingsPatch(settings,id,event);if(patch)settings.patch(patch);
    },back);
    const message=confirm==='clear'?'仅清空推荐偏好，不删除收藏、歌单、播放历史或本地音乐。':confirm==='resetLayout'?'恢复模块默认顺序并显示所有模块？':'恢复探索、跨歌手、熟悉音乐及来源权重的默认值？';
    return createPortal(<div ref={root} className="fixed inset-0" style={{zIndex:136}} data-folia-settings-overlay="true" data-folia-keyboard-window="true" data-settings-layout="column">
        <OperationPanel id="discovery-settings-confirm" panel={confirm?{title:'确认操作',kind:'dialog',blocks:[{id:'confirm',kind:'confirm',message,confirmLabel:'确认',cancelLabel:'取消'}]}:null}
            onClose={()=>setConfirm(null)} onAction={id=>{if(id==='confirm'){
                if(confirm==='clear')clearDiscoveryPreferences();
                else settings.patch(confirm==='resetLayout'?resetDiscoveryLayout():resetDiscoveryParameters());
            }setConfirm(null);}}/>
    </div>,document.body);
}

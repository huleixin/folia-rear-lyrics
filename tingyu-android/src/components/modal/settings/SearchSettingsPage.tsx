import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNativeSettingsDocument } from '../../../hooks/useNativeSettingsDocument';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { useSearchSettingsStore } from '../../../stores/useSearchSettingsStore';
import { useSearchHistoryStore } from '../../../stores/useSearchHistoryStore';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { omni } from '../../../services/onlineMusic/omni';
import { runTopModalBack } from '../../../services/modalBackStack';
import OperationPanel from '../../shared/OperationPanel';
import { applySearchSettingsAction, searchSettingsModel } from './searchSettingsModel';

// src/components/modal/settings/SearchSettingsPage.tsx
export default function SearchSettingsPage({onClose}:{onClose:()=>void}) {
    const {t}=useTranslation();
    const root=useRef<HTMLDivElement>(null);
    useSearchSettingsStore();
    useSearchHistoryStore(s=>s.recording);
    useOnlineProviderAccountStore(s=>s.accounts);
    useSyncExternalStore(omni.subscribeProviders,omni.getProviderRegistryVersion);
    const fromIndex=useSettingsModalStore(s=>s.settingsModalState.returnToIndex);
    const [confirm,setConfirm]=useState(false);
    const back=()=>fromIndex?useSettingsModalStore.getState().returnSettingsToIndex():onClose();
    useEffect(()=>{
        const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){
            if(runTopModalBack())return;
            event.preventDefault();event.stopImmediatePropagation();back();
        }};
        window.addEventListener('keydown',onKey,true);
        return()=>window.removeEventListener('keydown',onKey,true);
    },[fromIndex,onClose]);
    useNativeSettingsDocument(root,true,'search',t('searchSettings.title'),searchSettingsModel(),(id,event)=>{
        if(id==='clear')setConfirm(true);else applySearchSettingsAction(id,event.text);
    },back);
    return createPortal(<div ref={root} className="fixed inset-0" style={{zIndex:136}} data-folia-settings-overlay="true" data-folia-keyboard-window="true" data-settings-layout="column">
        <OperationPanel id="search-settings-confirm" panel={confirm?{title:t('searchSettings.clear'),kind:'dialog',blocks:[{id:'confirm',kind:'confirm',message:t('searchSettings.clearHint'),confirmLabel:t('searchSettings.confirm'),cancelLabel:t('searchSettings.cancel')}]}:null}
            onClose={()=>setConfirm(false)} onAction={id=>{if(id==='confirm')useSearchHistoryStore.getState().clearAll();setConfirm(false);}}/>
    </div>,document.body);
}

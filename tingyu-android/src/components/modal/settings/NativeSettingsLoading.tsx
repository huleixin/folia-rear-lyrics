import React,{useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {useNativePage} from '../../../hooks/useNativePage';
import {buildSettingsNavGroups,findSettingsNavItem,type SettingsSectionId} from './navigation/settingsNavModel';
import type {SettingsSubviewId} from '../../../stores/useSettingsModalStore';

// src/components/modal/settings/NativeSettingsLoading.tsx
// Never substitute the index for an editor while its packaged business module loads.
export default function NativeSettingsLoading({section,onClose}:{section?:SettingsSubviewId|null;onClose:()=>void}){
    const root=useRef<HTMLDivElement>(null),{t}=useTranslation();
    const title=section==='visualizer'?t('options.lyricsStyleSettings'):findSettingsNavItem(buildSettingsNavGroups(t,{isElectron:false,hasLibrarySuiteChoice:true,isBravaisSuiteActive:false}),section as SettingsSectionId)?.label??t('ui.options');
    useNativePage(root,'settings',true,{key:`settings:loading:${section??''}`,title,leading:'close',sections:[]},{close:onClose});
    return <div ref={root} className="fixed inset-0" data-folia-keyboard-window="true"/>;
}

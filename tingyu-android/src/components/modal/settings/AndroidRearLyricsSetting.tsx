import React from 'react';
import {useRearLyricsSettings} from './useRearLyricsSettings';
import RearLyricsEntry from './RearLyricsEntry';
import './rearControl.css';

// src/components/modal/settings/AndroidRearLyricsSetting.tsx
// Legacy callers share the same compact entry; the controller lives on the independent settings route.
export default function AndroidRearLyricsSetting({onOpenGuide}:{isDaylight:boolean;settingsCardClass:string;theme?:{secondaryColor?:string}|null;compact?:boolean;onOpenGuide?:()=>void}){
    const rear=useRearLyricsSettings();
    return <RearLyricsEntry state={rear} onOpen={onOpenGuide??(()=>{void import('../../../stores/useSettingsModalStore').then(m=>m.useSettingsModalStore.getState().openRearSettings())})}/>;
}

import React from 'react';
import { Captions,ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { rearEntrySubtitle,type RearPresentation } from './rearControlModel';

// src/components/modal/settings/RearLyricsEntry.tsx
export default function RearLyricsEntry({state,onOpen}:{state:RearPresentation;onOpen:()=>void}){
    const {t}=useTranslation();if(!state.available)return null;
    return <div className="ty-settings-feature"><div className="ty-settings-card">
        <button type="button" className="ty-settings-row ty-rear-entry" onClick={onOpen}>
            <span className="ty-setting-symbol"><Captions size={21}/></span>
            <span className="ty-settings-row-copy"><strong>{t('rearControl.title')}</strong>
                <small title={rearEntrySubtitle(state.snapshot,state.failed,t)}>{rearEntrySubtitle(state.snapshot,state.failed,t)}</small></span><ChevronRight size={18}/>
        </button>
    </div></div>;
}

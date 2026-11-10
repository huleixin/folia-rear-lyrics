import React from 'react';
import { Captions,ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { rearEntrySubtitle,type RearPresentation } from './rearControlModel';

// src/components/modal/settings/RearLyricsEntry.tsx
export default function RearLyricsEntry({state,onOpen}:{state:RearPresentation;onOpen:()=>void}){
    const {t}=useTranslation();if(!state.available)return null;
    return <div className="ty-settings-feature" data-settings-style='{"margin":[0,0,0,16]}' data-settings-layout="column"><div className="ty-settings-card" data-settings-style='{"border":true,"radius":14}' data-settings-layout="card">
        <button type="button" className="ty-settings-row ty-rear-entry" onClick={onOpen} data-settings-style='{"align":"center","gap":12,"padding":[14,8,14,8],"minHeight":48}' data-settings-layout="row">
            <span className="ty-setting-symbol" data-settings-layout="wrap"><Captions size={21}/></span>
            <span className="ty-settings-row-copy" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column"><strong data-settings-layout="wrap">{t('rearControl.title')}</strong>
                <small title={rearEntrySubtitle(state.snapshot,state.failed,t)} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{rearEntrySubtitle(state.snapshot,state.failed,t)}</small></span><ChevronRight size={18}/>
        </button>
    </div></div>;
}

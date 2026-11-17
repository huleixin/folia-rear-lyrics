import i18n from '../../../i18n/config';
import type { NativeSettingsFlow } from '../../../types/nativeSettingsDocument';
import { providerLabel } from '../../../services/onlineMusic/providerLabel';
import { useSearchSettingsStore, searchableSources } from '../../../stores/useSearchSettingsStore';
import { useSearchHistoryStore } from '../../../stores/useSearchHistoryStore';

// src/components/modal/settings/searchSettingsModel.ts
export function searchSettingsModel(): NativeSettingsFlow {
    const t = (key: string) => i18n.t('searchSettings.' + key);
    const settings = useSearchSettingsStore.getState();
    const sources = searchableSources();
    const enabled = sources.filter(id => !settings.disabled.includes(id));
    return { key: 'search', title: t('title'), nodes: [
        {id:'sources',kind:'group',title:t('sources')},
        {id:'scope',kind:'note',title:t('scope')},
        ...sources.map(id => ({id:'source:'+id,kind:'switch' as const,title:providerLabel(id,false),value:settings.disabled.includes(id)?'0':'1'})),
        {id:'priority',kind:'select',title:t('priority'),value:enabled.includes(settings.priority)?settings.priority:'',
            options:[{value:'',label:t('automatic')},...enabled.map(id=>({value:id,label:providerLabel(id,false)}))]},
        {id:'ranking',kind:'group',title:t('ranking')},
        {id:'sort',kind:'select',title:t('sort'),value:settings.sort,options: ['relevance','local','provider'].map(value=>({value,label:t(value)}))},
        {id:'rankingNote',kind:'note',title:t('rankingNote')},
        {id:'privacy',kind:'group',title:t('privacy')},
        {id:'record',kind:'switch',title:t('record'),hint:t('recordHint'),value:useSearchHistoryStore.getState().recording?'1':'0'},
        {id:'clear',kind:'action',title:t('clear'),value:'danger'},
    ]};
}
/** Reject unknown/stale bridge options before changing the shared settings. */
export function applySearchSettingsAction(id:string,text?:string): void {
    const settings=useSearchSettingsStore.getState();
    const sources=searchableSources();
    if(id==='record'&&(text==='0'||text==='1'))useSearchHistoryStore.getState().setRecording(text==='1');
    else if(id.startsWith('source:')&&sources.includes(id.slice(7))&&(text==='0'||text==='1')) {
        const source=id.slice(7);
        if(settings.disabled.includes(source)===(text==='1'))settings.toggle(source);
        if(text==='0'&&settings.priority===source)settings.setPriority('');
    } else if(id==='priority'&&(text===''||sources.includes(text??'')&&!settings.disabled.includes(text!)))settings.setPriority(text!);
    else if(id==='sort'&&(text==='relevance'||text==='local'||text==='provider'))settings.setSort(text);
}

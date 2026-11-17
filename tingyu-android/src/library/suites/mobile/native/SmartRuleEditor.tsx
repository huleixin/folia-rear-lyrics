import { useTranslation } from 'react-i18next';
import React, { useEffect, useMemo, useState } from 'react';
import OperationPanel from '../../../../components/shared/OperationPanel';
import { useLibraryOrganization } from '../../../core/state/useLibraryOrganization';
import { evaluateSmartPlaylist, type SmartRule, type SmartField, type SmartCondition, type SmartCandidate } from '../../../core/model/smartPlaylists';
import type { ListeningSessionRecord } from '../../../../types/listeningStatistics';
import type { NativePanelBlock } from '../../../../types/nativePanels';
import { omni } from '../../../../services/onlineMusic/omni';
import { parseDay } from '../../../core/model/listeningRange';

// src/library/suites/mobile/native/SmartRuleEditor.tsx
const numeric: SmartField[] = ['plays', 'seconds', 'duration', 'lastPlayed', 'addedAt'];
function newRuleId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}
export const newSmartRule = (name: string): SmartRule => ({ id: 'custom:' + newRuleId(), name, match: 'all', conditions: [], sort: 'name', limit: 30 });
export default function SmartRuleEditor({ rule, onChange, onClose, candidates, sessions, onPreview }: {
    rule: SmartRule | null; onChange: (rule: SmartRule) => void; onClose: () => void;
    candidates: SmartCandidate[]; sessions: ListeningSessionRecord[]; onPreview: (rule: SmartRule) => void;
}) {
    const { t } = useTranslation();
    const labels: Record<SmartField,string> = { source:t('libraryV2.sources'), artist:t('libraryV2.field_artist'), album:t('libraryV2.field_album'), name:t('libraryV2.field_name'), liked:t('libraryV2.field_liked'), plays:t('libraryV2.field_plays'), seconds:t('libraryV2.field_seconds'), lastPlayed:t('libraryV2.field_lastPlayed'), addedAt:t('libraryV2.field_addedAt'), quality:t('libraryV2.field_quality'), duration:t('libraryV2.field_duration'), folder:t('libraryV2.field_folder'), tag:t('libraryV2.field_tag') };
    const conditionLabel = (condition: SmartCondition) => condition.field === 'source' ? omni.getProviderLabel(String(condition.value), false)
        : condition.field === 'liked' ? condition.value ? t('libraryV2.liked') : t('libraryV2.notLiked')
        : condition.field === 'lastPlayed' || condition.field === 'addedAt' ? new Date(Number(condition.value)).toLocaleDateString() : String(condition.value);
    const store = useLibraryOrganization();
    const [field,setField] = useState<SmartField>('artist'), [op,setOp] = useState<SmartCondition['op']>('contains');
    const [error,setError] = useState(''), [confirm,setConfirm] = useState(false);
    useEffect(() => { setError(''); setConfirm(false); setField('artist'); setOp('contains'); }, [rule?.id]);
    const count = useMemo(() => rule ? evaluateSmartPlaylist(candidates,sessions,rule).length : 0, [candidates, sessions, rule]);
    const blocks: NativePanelBlock[] = rule ? [
        { id:'name',kind:'input',label:t('libraryV2.name'),value:rule.name,confirmLabel:t('libraryV2.updateName') },
        { id:'match',kind:'select',label:t('libraryV2.match'),value:rule.match,options:[{value:'all',label:t('libraryV2.all')},{value:'any',label:t('libraryV2.any')}] },
        { id:'conditions',kind:'actions',label:t('libraryV2.conditions'),items:rule.conditions.map((condition,index)=>({id:'remove:'+index,label:labels[condition.field]+' '+({is:t('libraryV2.is'),contains:t('libraryV2.contains'),gte:t('libraryV2.gte'),lte:t('libraryV2.lte')}[condition.op])+' '+conditionLabel(condition)})) },
        { id:'field',kind:'select',label:t('libraryV2.field'),value:field,options:Object.entries(labels).map(([value,label])=>({value,label})) },
        { id:'op',kind:'select',label:t('libraryV2.operator'),value:op,options:(field==='liked'||field==='source'?['is']:numeric.includes(field)?['gte','lte','is']:['contains','is']).map(value=>({value,label:({is:t('libraryV2.is'),contains:t('libraryV2.contains'),gte:t('libraryV2.gte'),lte:t('libraryV2.lte')} as Record<string,string>)[value]})) },
        ...(field==='liked'||field==='source' ? [{ id:'value',kind:'select' as const,label:t('libraryV2.addSelected'),value:'',options:field==='liked'
            ? [{value:'true',label:t('libraryV2.liked')},{value:'false',label:t('libraryV2.notLiked')}]
            : [{value:'local',label:t('libraryV2.localMusic')},...omni.getProviderSummaries().map(provider=>({value:provider.providerId,label:omni.getProviderLabel(provider.providerId,false)}))] }]
            : [{ id:'value',kind:'input' as const,label:t('libraryV2.value'),value:'',placeholder:field==='lastPlayed'||field==='addedAt'?'YYYY-MM-DD':field==='quality'?t('libraryV2.qualityHint'):t('libraryV2.valueHint'),confirmLabel:t('libraryV2.addCondition') }]),
        { id:'sort',kind:'select',label:t('libraryV2.sort'),value:rule.sort,options:['name','plays','seconds','lastPlayed','addedAt'].map(value=>({value,label:labels[value as SmartField]})) },
        { id:'limit',kind:'input',label:t('libraryV2.limit'),value:String(rule.limit),confirmLabel:t('libraryV2.updateLimit') },
        { id:'result',kind:'note',text:t('libraryV2.previewCount', { count }) },
        { id:'actions',kind:'actions',items:[{id:'preview',label:t('libraryV2.preview'),disabled:!count},{id:'save',label:t('libraryV2.saveRule')},...(store.rules.some(item=>item.id===rule.id)?[{id:'delete',label:t('libraryV2.deleteRule'),tone:'danger' as const}]:[])] },
        ...(error?[{id:'error',kind:'note' as const,text:error,tone:'error' as const}]:[]),
        ...(confirm?[{id:'confirm-delete',kind:'confirm' as const,message:t('libraryV2.deleteConfirm'),confirmLabel:t('libraryV2.delete'),tone:'danger' as const}]:[])
    ] : [];
    return <OperationPanel id="library-smart-rule" panel={rule?{title:t('libraryV2.customSmart'),blocks}:null} onClose={()=>{setConfirm(false);setError('');onClose();}} onAction={(id,payload)=>{
        if(!rule)return;const value=payload?.text||'';setError('');
        if(id==='name'&&value.trim())onChange({...rule,name:value.trim().slice(0,80)});
        if(id==='match'&&(value==='all'||value==='any'))onChange({...rule,match:value});
        if(id==='field'&&value in labels){setField(value as SmartField);setOp(value==='liked'||value==='source'?'is':numeric.includes(value as SmartField)?'gte':'contains');}
        if(id==='op')setOp(value as SmartCondition['op']);
        if(id==='value'){
            let parsed: string|number|boolean=value.trim();
            if(field==='liked'){if(!['true','false'].includes(value)){setError(t('libraryV2.invalidLiked'));return;}parsed=value==='true';}
            else if(numeric.includes(field)){parsed=field==='lastPlayed'||field==='addedAt'?(parseDay(value)?.getTime()??NaN):Number(value);if(!value.trim()||!Number.isFinite(parsed)){setError(t('libraryV2.invalidValue'));return;}}
            if(parsed===''||rule.conditions.length>=20){setError(t('libraryV2.invalidConditions'));return;}
            onChange({...rule,conditions:[...rule.conditions,{field,op:field==='liked'?'is':op,value:parsed}]});
        }
        if(id.startsWith('remove:'))onChange({...rule,conditions:rule.conditions.filter((_,index)=>index!==Number(id.slice(7)))});
        if(id==='sort'&&['name','plays','seconds','lastPlayed','addedAt'].includes(value))onChange({...rule,sort:value as SmartRule['sort']});
        if(id==='limit'){const limit=Number(value);if(Number.isInteger(limit)&&limit>=1&&limit<=1000)onChange({...rule,limit});else setError(t('libraryV2.invalidLimit'));}
        if(id==='preview')onPreview(rule);
        if(id==='save'){if(!rule.name.trim()||!rule.conditions.length){setError(t('libraryV2.incompleteRule'));return;}store.saveRule(rule);onClose();}
        if(id==='delete')setConfirm(true);
        if(id==='confirm-delete'){store.removeRule(rule.id);setConfirm(false);onClose();}
    }}/>;
}

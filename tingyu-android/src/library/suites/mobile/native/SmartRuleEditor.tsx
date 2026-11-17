import React, { useEffect, useState } from 'react';
import OperationPanel from '../../../../components/shared/OperationPanel';
import { useLibraryOrganization } from '../../../core/state/useLibraryOrganization';
import { evaluateSmartPlaylist, type SmartRule, type SmartField, type SmartCondition, type SmartCandidate } from '../../../core/model/smartPlaylists';
import type { ListeningSessionRecord } from '../../../../types/listeningStatistics';
import type { NativePanelBlock } from '../../../../types/nativePanels';
import { omni } from '../../../../services/onlineMusic/omni';
import { parseDay } from '../../../core/model/listeningRange';

// src/library/suites/mobile/native/SmartRuleEditor.tsx
const labels: Record<SmartField,string> = { source:'音乐来源', artist:'歌手', album:'专辑', name:'歌曲名称', liked:'是否收藏', plays:'有效播放次数', seconds:'有效收听秒数', lastPlayed:'最近播放日期', addedAt:'添加日期', quality:'可选音质', duration:'歌曲秒数', folder:'本地文件夹', tag:'可信风格标签' };
const numeric: SmartField[] = ['plays','seconds','duration','lastPlayed','addedAt'];
const conditionLabel = (condition: SmartCondition) => condition.field === 'source' ? omni.getProviderLabel(String(condition.value), false)
    : condition.field === 'liked' ? condition.value ? '已收藏' : '未收藏'
    : condition.field === 'lastPlayed' || condition.field === 'addedAt' ? new Date(Number(condition.value)).toLocaleDateString() : String(condition.value);
function newRuleId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}
export const newSmartRule = (): SmartRule => ({ id: 'custom:' + newRuleId(), name: '我的智能歌单', match: 'all', conditions: [], sort: 'name', limit: 30 });
export default function SmartRuleEditor({ rule, onChange, onClose, candidates, sessions, onPreview }: {
    rule: SmartRule | null; onChange: (rule: SmartRule) => void; onClose: () => void;
    candidates: SmartCandidate[]; sessions: ListeningSessionRecord[]; onPreview: (rule: SmartRule) => void;
}) {
    const store = useLibraryOrganization();
    const [field,setField] = useState<SmartField>('artist'), [op,setOp] = useState<SmartCondition['op']>('contains');
    const [error,setError] = useState(''), [confirm,setConfirm] = useState(false);
    useEffect(() => { setError(''); setConfirm(false); setField('artist'); setOp('contains'); }, [rule?.id]);
    const count = rule ? evaluateSmartPlaylist(candidates,sessions,rule).length : 0;
    const blocks: NativePanelBlock[] = rule ? [
        { id:'name',kind:'input',label:'名称',value:rule.name,confirmLabel:'更新名称' },
        { id:'match',kind:'select',label:'匹配条件',value:rule.match,options:[{value:'all',label:'满足全部'},{value:'any',label:'满足任意'}] },
        { id:'conditions',kind:'actions',label:'已有条件 · 点击移除',items:rule.conditions.map((condition,index)=>({id:'remove:'+index,label:labels[condition.field]+' '+({is:'等于',contains:'包含',gte:'不少于',lte:'不多于'}[condition.op])+' '+conditionLabel(condition)})) },
        { id:'field',kind:'select',label:'新增条件字段',value:field,options:Object.entries(labels).map(([value,label])=>({value,label})) },
        { id:'op',kind:'select',label:'比较方式',value:op,options:(field==='liked'||field==='source'?['is']:numeric.includes(field)?['gte','lte','is']:['contains','is']).map(value=>({value,label:({is:'等于',contains:'包含',gte:'不少于',lte:'不多于'} as Record<string,string>)[value]})) },
        ...(field==='liked'||field==='source' ? [{ id:'value',kind:'select' as const,label:'选择并添加条件',value:'',options:field==='liked'
            ? [{value:'true',label:'已收藏'},{value:'false',label:'未收藏'}]
            : [{value:'local',label:'本地音乐'},...omni.getProviderSummaries().map(provider=>({value:provider.providerId,label:omni.getProviderLabel(provider.providerId,false)}))] }]
            : [{ id:'value',kind:'input' as const,label:'条件值',value:'',placeholder:field==='lastPlayed'||field==='addedAt'?'YYYY-MM-DD':field==='quality'?'lossless / hires / dolby 等真实音质标记':'输入要匹配的内容',confirmLabel:'添加条件' }]),
        { id:'sort',kind:'select',label:'排序',value:rule.sort,options:['name','plays','seconds','lastPlayed','addedAt'].map(value=>({value,label:labels[value as SmartField]})) },
        { id:'limit',kind:'input',label:'最多歌曲数（1—1000）',value:String(rule.limit),confirmLabel:'更新数量' },
        { id:'result',kind:'note',text:`当前候选匹配 ${count} 首。缺少可信字段的歌曲不会匹配；不会改动来源歌单。` },
        { id:'actions',kind:'actions',items:[{id:'preview',label:'预览歌曲',disabled:!count},{id:'save',label:'保存规则'},...(store.rules.some(item=>item.id===rule.id)?[{id:'delete',label:'删除此规则',tone:'danger' as const}]:[])] },
        ...(error?[{id:'error',kind:'note' as const,text:error,tone:'error' as const}]:[]),
        ...(confirm?[{id:'confirm-delete',kind:'confirm' as const,message:'仅删除智能规则，保留歌曲、收藏和播放记录。',confirmLabel:'删除规则',tone:'danger' as const}]:[])
    ] : [];
    return <OperationPanel id="library-smart-rule" panel={rule?{title:'自定义智能歌单',blocks}:null} onClose={()=>{setConfirm(false);setError('');onClose();}} onAction={(id,payload)=>{
        if(!rule)return;const value=payload?.text||'';setError('');
        if(id==='name'&&value.trim())onChange({...rule,name:value.trim().slice(0,80)});
        if(id==='match'&&(value==='all'||value==='any'))onChange({...rule,match:value});
        if(id==='field'&&value in labels){setField(value as SmartField);setOp(value==='liked'||value==='source'?'is':numeric.includes(value as SmartField)?'gte':'contains');}
        if(id==='op')setOp(value as SmartCondition['op']);
        if(id==='value'){
            let parsed: string|number|boolean=value.trim();
            if(field==='liked'){if(!['true','false'].includes(value)){setError('收藏状态请输入 true 或 false。');return;}parsed=value==='true';}
            else if(numeric.includes(field)){parsed=field==='lastPlayed'||field==='addedAt'?(parseDay(value)?.getTime()??NaN):Number(value);if(!value.trim()||!Number.isFinite(parsed)){setError('请输入有效数值或日期。');return;}}
            if(parsed===''||rule.conditions.length>=20){setError('条件不能为空，最多20项。');return;}
            onChange({...rule,conditions:[...rule.conditions,{field,op:field==='liked'?'is':op,value:parsed}]});
        }
        if(id.startsWith('remove:'))onChange({...rule,conditions:rule.conditions.filter((_,index)=>index!==Number(id.slice(7)))});
        if(id==='sort'&&['name','plays','seconds','lastPlayed','addedAt'].includes(value))onChange({...rule,sort:value as SmartRule['sort']});
        if(id==='limit'){const limit=Number(value);if(Number.isInteger(limit)&&limit>=1&&limit<=1000)onChange({...rule,limit});else setError('数量应为1—1000的整数。');}
        if(id==='preview')onPreview(rule);
        if(id==='save'){if(!rule.name.trim()||!rule.conditions.length){setError('请填写名称并添加至少一项条件。');return;}store.saveRule(rule);onClose();}
        if(id==='delete')setConfirm(true);
        if(id==='confirm-delete'){store.removeRule(rule.id);setConfirm(false);onClose();}
    }}/>;
}

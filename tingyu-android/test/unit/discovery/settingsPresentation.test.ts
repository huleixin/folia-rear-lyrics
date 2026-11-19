import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverySettingsModel, discoverySettingsPatch, resetDiscoveryLayout, resetDiscoveryParameters } from '../../../src/components/modal/settings/discoverySettingsModel';
import { defaultDiscoverySettings } from '../../../src/stores/useDiscoverySettingsStore';
import { providerLabel } from '../../../src/services/onlineMusic/providerLabel';
import zh from '../../../src/i18n/locales/zh-CN';
import en from '../../../src/i18n/locales/en';
import indonesian from '../../../src/i18n/locales/in';

// test/unit/discovery/settingsPresentation.test.ts
const language=vi.hoisted(()=>({value:'zh'}));
vi.mock('../../../src/i18n/config',()=>({default:{t:(key:string,options:{defaultValue:string})=>{
    const labels=language.value==='zh'?zh.musicProviders:language.value==='en'?en.musicProviders:indonesian.musicProviders;
    const [,id,form]=key.split('.');return (labels as any)[id]?.[form]??options.defaultValue;
}}}));
afterEach(()=>{language.value='zh';});
const base=()=>structuredClone(defaultDiscoverySettings);
describe('discovery settings presentation preserves existing business values',()=>{
    it('groups the native document and combines source switches and weights',()=>{
        const nodes=discoverySettingsModel(base(),[{providerId:'kugou',displayName:'KuGou Music'}]).nodes;
        expect(nodes.filter(n=>n.kind==='group')).toHaveLength(6);
        const sourceOrder=nodes.find(n=>n.id==='sourceOrder');
        expect(sourceOrder?.kind).toBe('sourceOrder');
        expect(JSON.parse(sourceOrder!.value!)).toEqual([expect.objectContaining({id:'kugou',label:'酷狗音乐',enabled:true,weight:'1'})]);
        expect(nodes.filter(n=>n.kind==='slider').map(n=>[n.id,n.value,n.min,n.max])).toEqual([
            ['exploration','20',0,100],['crossArtist','30',0,100],['familiarity','50',0,100]]);
    });
    it.each(['exploration','crossArtist','familiarity'])('writes %s percentage without normalizing other preferences',id=>{
        const settings=base();expect(discoverySettingsPatch(settings,id,{value:73})).toEqual({[id]:.73});
        expect(settings).toEqual(defaultDiscoverySettings);
        expect(discoverySettingsPatch(settings,id,{value:200})).toEqual({[id]:1});
        expect(discoverySettingsPatch(settings,id,{value:-20})).toEqual({[id]:0});
        expect(discoverySettingsPatch(settings,id,{value:NaN})).toBeNull();
    });
    it('preserves other source values and rejects weight changes while disabled',()=>{
        const settings={...base(),enabled:{netease:true,kugou:false},weights:{netease:3,kugou:2}};
        expect(discoverySettingsPatch(settings,'source:kugou',{text:'weight:3'})).toBeNull();
        expect(discoverySettingsPatch(settings,'source:netease',{text:'weight:2'})).toEqual({weights:{netease:2,kugou:2}});
        expect(discoverySettingsPatch(settings,'source:netease',{text:'weight:999'})).toBeNull();
        expect(discoverySettingsPatch(settings,'source:kugou',{text:'1'})).toEqual({enabled:{netease:true,kugou:true}});
    });
    it('accepts complete reordered modules and rejects dropped or duplicated IDs',()=>{
        const settings=base(),reversed=[...settings.modules].reverse();
        expect(discoverySettingsPatch(settings,'modules',{text:JSON.stringify(reversed)})).toEqual({modules:reversed});
        for(const value of [[],['roam'],[...settings.modules.slice(1),'shortcuts'],'invalid'])
            expect(discoverySettingsPatch(settings,'modules',{text:JSON.stringify(value)})).toBeNull();
        expect(discoverySettingsPatch(settings,'modules',{text:'toggle:radars'})).toEqual({hidden:['radars']});
        expect(discoverySettingsPatch({...settings,hidden:['radars']},'modules',{text:'toggle:radars'})).toEqual({hidden:[]});
    });
    it('reset patches cannot erase record consent, selected source or user music',()=>{
        expect(Object.keys(resetDiscoveryLayout()).sort()).toEqual(['hidden','modules']);
        expect(Object.keys(resetDiscoveryParameters()).sort()).toEqual(['crossArtist','exploration','familiarity','weights']);
    });
    it('localizes full/short labels and falls back without altering provider identities',()=>{
        expect(providerLabel('netease')).toBe('网易云音乐');expect(providerLabel('netease',true)).toBe('网易云');
        expect(providerLabel('kugou')).toBe('酷狗音乐');expect(providerLabel('kugou',true)).toBe('酷狗');
        expect(providerLabel('third-party',true,'Custom source')).toBe('Custom source');
        language.value='en';expect(providerLabel('netease')).toBe(en.musicProviders.netease.full);
        language.value='in';expect(providerLabel('local',true)).toBe(indonesian.musicProviders.local.short);
    });
});

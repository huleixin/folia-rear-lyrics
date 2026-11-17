import type { NativeSettingsFlow, NativeSettingsFlowNode } from '../../../types/nativeSettingsDocument';
import { defaultDiscoverySettings, discoveryModules, type DiscoverySettings, type DiscoveryModule } from '../../../stores/useDiscoverySettingsStore';
import { providerLabel } from '../../../services/onlineMusic/providerLabel';

// src/components/modal/settings/discoverySettingsModel.ts
export const moduleNames: Record<DiscoveryModule,string> = {roam:'听屿漫游',shortcuts:'快捷入口',radars:'你的专属雷达',songs:'猜你想听',collections:'为你精选歌单',recent:'最近播放',playlists:'我的歌单'};
type Source = {providerId:string;displayName:string;loggedIn?:boolean};
export function discoverySettingsModel(settings: DiscoverySettings, sources: Source[]): NativeSettingsFlow {
    const group = (id:string,title:string):NativeSettingsFlowNode => ({id,kind:'group',title});
    return {key:'discovery',title:'推荐设置',nodes:[
        group('personal','个性化推荐'),
        {id:'record',kind:'switch',title:'个性化记录',hint:'仅保存在本机；关闭后不再记录新的偏好',value:settings.record?'1':'0'},
        {id:'includeLocal',kind:'switch',title:'包含本地音乐',hint:'将本地曲库纳入综合推荐；独立本地模式保持不变',value:settings.includeLocal?'1':'0'},
        group('preferences','推荐偏好'),
        ...(['exploration','crossArtist','familiarity'] as const).map((id,index):NativeSettingsFlowNode=>({id,kind:'slider',
            title:['音乐探索程度','跨歌手探索程度','熟悉音乐比例'][index],
            hint:['提高未听过歌曲的推荐权重','降低常听歌手加成，增加歌手多样性','调整熟悉歌曲偏好强度，不代表固定队列占比'][index],
            value:String(Math.round(settings[id]*100)),min:0,max:100,step:1,unit:'%'})),
        {id:'independent',kind:'note',title:'三个参数独立生效，无需相加为100%。调整后重新生成推荐。'},
        group('sources','综合推荐来源'),
        {id:'hideUnloggedInPrompts',kind:'switch',title:'隐藏未登录提示',hint:'开启后综合推荐页不显示未登录平台的重复提示与空白占位；不影响独立平台公开推荐',value:settings.hideUnloggedInPrompts!==false?'1':'0'},
        ...sources.map((source):NativeSettingsFlowNode=>{
            const label = providerLabel(source.providerId,false,source.displayName);
            const statusSuffix = source.loggedIn === true ? '（已登录）' : source.loggedIn === false ? '（未登录）' : '';
            return {id:'source:'+source.providerId,kind:'source',title:label+statusSuffix,
                value:settings.enabled[source.providerId]===false?'0':'1',detail:String(settings.weights[source.providerId]??1),
                options:[.5,1,2,3].map(value=>({value:String(value),label:value+'×'}))};
        }),
        {id:'manageSources',kind:'action',title:'音乐来源管理',hint:'账户、登录与音乐来源',icon:'settings'},
        group('layout','页面管理'),
        {id:'modules',kind:'moduleOrder',title:'首页模块',hint:'拖动把手调整顺序，开关控制显示',value:JSON.stringify(settings.hidden),
            options:settings.modules.map(id=>({value:id,label:moduleNames[id]}))},
        {id:'resetLayout',kind:'action',title:'恢复默认布局'},
        group('privacy','数据与隐私'),
        {id:'privacyNote',kind:'note',title:'推荐偏好仅保存在本机，不上传至新增服务。清空偏好不会删除收藏、歌单、播放历史或本地音乐。'},
        {id:'resetParameters',kind:'action',title:'恢复默认推荐参数'},
        {id:'clear',kind:'action',title:'清空推荐偏好',value:'danger'},
    ]};
}
/** Validate bridge values before touching the existing persisted settings. */
export function discoverySettingsPatch(settings:DiscoverySettings,id:string,event:{text?:string;value?:number}):Partial<DiscoverySettings>|null {
    if(id==='record'||id==='includeLocal'||id==='hideUnloggedInPrompts')return {[id]:event.text==='1'};
    if(['exploration','crossArtist','familiarity'].includes(id)) {
        if(!Number.isFinite(event.value))return null;
        return {[id]:Math.max(0,Math.min(100,event.value!))/100};
    }
    if(id.startsWith('source:')) {
        const source=id.slice(7);
        if(event.text==='1'||event.text==='0')return {enabled:{...settings.enabled,[source]:event.text==='1'}};
        if(event.text?.startsWith('weight:')&&settings.enabled[source]!==false){
            const weight=Number(event.text.slice(7));
            if([.5,1,2,3].includes(weight))return {weights:{...settings.weights,[source]:weight}};
        }
    }
    if(id==='modules') {
        if(event.text?.startsWith('toggle:')){
            const module=event.text.slice(7) as DiscoveryModule;
            if(discoveryModules.includes(module))return {hidden:settings.hidden.includes(module)?settings.hidden.filter(m=>m!==module):[...settings.hidden,module]};
        }else try {
            const order:unknown=JSON.parse(event.text??'');
            if(Array.isArray(order)&&order.length===discoveryModules.length&&new Set(order).size===order.length&&order.every(m=>discoveryModules.includes(m)))return {modules:order};
        }catch { /* Ignore incomplete or stale bridge packets. */ }
    }
    return null;
}
export const resetDiscoveryLayout = () => ({modules:[...discoveryModules],hidden:[]});
export const resetDiscoveryParameters = () => ({exploration:defaultDiscoverySettings.exploration,crossArtist:defaultDiscoverySettings.crossArtist,familiarity:defaultDiscoverySettings.familiarity,weights:{}});

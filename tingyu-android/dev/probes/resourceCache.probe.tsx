import React from 'react';
import {ResourceCacheCard} from '../../src/components/modal/settings/SmartResourceCacheSettings';
import StorageSettingsSection from '../../src/components/modal/settings/StorageSettingsSection';
import type {ResourceStatus} from '../../src/components/modal/settings/useResourceCacheStatus';
import {captureSettingsDocument} from '../../src/services/nativeSettingsDocument';
import i18n from '../../src/i18n/config';
import type {ProbeDefinition} from './definition';
// dev/probes/resourceCache.probe.tsx
const initial:ResourceStatus={enabled:true,wifiOnly:false,lyricsBytes:22439526,artworkBytes:18559795,total:396,completed:396,failed:0,cachedSongs:455,pending:0,metadataComplete:true,discovered:396,paused:false,networkAllowed:true,jobState:'complete',nextDue:0,platformPending:0,confirmedLyrics:396,provisionalLyrics:0,noLyrics:0,lastError:''};
const Component=()=>{
 const [status,setStatus]=React.useState(initial),[action,setAction]=React.useState(''),[light,setLight]=React.useState(false);
 const root=React.useRef<HTMLElement>(null);
 React.useEffect(()=>{void i18n.changeLanguage('zh-CN');Object.assign(window,{__captureStorage:()=>captureSettingsDocument(root.current!)});},[]);
 return <><aside style={{display:'flex',gap:12,padding:8,fontSize:12}}><button onClick={()=>setStatus({...initial,completed:72,pending:324,platformPending:200,confirmedLyrics:72,jobState:'scheduled'})}>预览处理中</button><button onClick={()=>setLight(!light)}>切换预览主题</button><output>{action}</output></aside><main ref={root} data-storage-preview className="font-sans" style={{padding:20,maxWidth:560,margin:'auto','--text-primary':light?'#213e34':'#e8f5ee','--text-secondary':light?'#536b60':'#a6bdb0','--accent-color':light?'#246e55':'#8bd1b6',background:light?'#f1f4ed':'#071c14',color:light?'#213e34':'#e8f5ee'} as React.CSSProperties}>
 <header style={{padding:'12px 0 28px',fontWeight:650,fontSize:22}}>存储与同步</header>
 <div style={{marginBottom:28}}><ResourceCacheCard busy={false} error="" status={status} update={async(next,patch)=>{setAction(next||'refresh');if(patch)setStatus(s=>({...s,...patch}));}}/></div>
 <StorageSettingsSection cacheDirectory="" cacheDirectoryIsDefault cacheDirectoryStatus="idle" cacheSizes={{playlist:'525.98 KB',lyrics:'8.05 MB',cover:'315.8 MB',media:'310.74 MB',analysis:'0 B'}} enableMediaCache={false} errorTextColor="text-red-400" isCleaning={null} isDaylight={light} isElectron={false} mediaCacheLimitGb={5} mediaCount={42} onChooseCacheDirectory={()=>{}} onClear={id=>setAction('clear:'+id)} onClearAll={()=>setAction('clear:all')} onSetMediaCacheLimitGb={()=>{}} onToggleMediaCache={()=>setAction('media-toggle')} settingsCardClass="border-white/10 bg-white/5" toggleOffBackgroundClass="bg-white/15"/>
 </main></>;
};
export default {id:'resourceCache',title:'存储与同步',description:'真实设置组件：完成/处理中、紧凑资源列表、同步配置折叠',Component} satisfies ProbeDefinition;

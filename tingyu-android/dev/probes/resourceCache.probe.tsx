import React from 'react';
import {ResourceCacheCard} from '../../src/components/modal/settings/SmartResourceCacheSettings';
import type {ProbeDefinition} from './definition';
// dev/probes/resourceCache.probe.tsx
const Component=()=> <main style={{padding:16,maxWidth:560,margin:'auto','--text-primary':'#e8f5ee','--text-secondary':'#a6bdb0',background:'#071c14',color:'#e8f5ee'} as React.CSSProperties}>
<ResourceCacheCard busy={false} error="" update={async()=>{}} status={{enabled:true,wifiOnly:false,lyricsBytes:17400000,artworkBytes:9600000,total:396,completed:72,failed:0,cachedSongs:455,pending:324,metadataComplete:true,discovered:396,paused:false,networkAllowed:true,jobState:'scheduled',nextDue:0,platformPending:200,lastError:''}}/>
<div className="cache-details-grid" style={{marginTop:20}}>{['歌单数据','歌词','封面','媒体文件','分析数据'].map(name=><div className="cache-detail-row" style={{display:'flex',padding:14,border:'1px solid #ffffff22',borderRadius:16}} key={name}><div style={{display:'flex',alignItems:'center',gap:12}}><div>◈</div><div><div>{name}</div><div className="text-xs">264.87 MB</div></div></div><div><button aria-label={'清理'+name}>×</button></div></div>)}</div>
</main>;
export default {id:'resourceCache',title:'智能资源缓存',description:'396 首真实状态布局，窄屏及字体放大',Component} satisfies ProbeDefinition;

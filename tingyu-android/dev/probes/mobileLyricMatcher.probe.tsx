import React, { useState } from 'react';
import type { ProbeDefinition } from './definition';
import type { SongResult } from '../../src/types';
import MobileLyricMatcher from '../../src/components/mobile-player/MobileLyricMatcher';
import type { LyricMatchSource } from '../../src/components/modal/lyricMatchResultHelpers';

// dev/probes/mobileLyricMatcher.probe.tsx
const results:SongResult[]=['岛屿来信','岛屿来信（现场版）','海风轻轻吹过'].map((name,i)=>({id:String(i),name,artists:[{id:1,name:i?'听屿测试歌手':'听屿测试歌手 · 测试合唱歌手'}],album:{id:1,name:'海风与唱片',coverUrl:''},durationMs:240000,sourceRef:{kind:'online',providerId:'netease',mediaId:String(i)}}));
function Probe(){const [selected,setSelected]=useState<SongResult|null>(results[0]),[source,setSource]=useState<LyricMatchSource>('netease'),[query,setQuery]=useState('岛屿来信 听屿测试歌手'),[saved,setSaved]=useState(false),[open,setOpen]=useState(true);return <div style={{background:'#06140e',height:'100dvh',color:'white',padding:24}}><p>{saved?'已选择':'听屿 · 测试匹配结果'}</p>{open&&<MobileLyricMatcher title="岛屿来信" query={query} onQuery={setQuery} source={source} onSource={setSource} results={results} selected={selected} onSelect={setSelected} searching={false} matching={false} onSearch={()=>{}} onConfirm={()=>{setSaved(true);setOpen(false);}} onClose={()=>setOpen(false)} isDaylight={false}/>}</div>;}
export default {id:'mobileLyricMatcher',title:'Tingyu single-column lyric matching',description:'Phone matching search, result selection, preview and fixed save action.',Component:Probe} satisfies ProbeDefinition;

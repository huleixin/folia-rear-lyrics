import React, { useRef, useState } from 'react';
import type { ProbeDefinition } from './definition';
import UnifiedPanel, { type UnifiedPanelProps, type PanelTab } from '../../src/components/UnifiedPanel';
import { PlayerState, type OnlineLyricsState, type SongResult, type Theme } from '../../src/types';

// dev/probes/mobileSongTools.probe.tsx
declare global { interface Window { __mobileToolsProbe?: {next:()=>void; state:()=>{offset:number;source:string;matched:number;file:string;index:number}}; } }
function Probe() {
    const [open,setOpen]=useState(true),[tab,setTab]=useState<PanelTab>('onlineLyrics');
    const [index,setIndex]=useState(1),[offset,setOffset]=useState(0),[source,setSource]=useState('online');
    const [file,setFile]=useState(''),[matched,setMatched]=useState(0),[playing,setPlaying]=useState(false);
    const scroll=useRef<HTMLDivElement>(null),noop=()=>{};
    const theme={backgroundColor:'#0c2119',primaryColor:'#f0f5eb',secondaryColor:'#8edbbd',accentColor:'#8edbbd'} as Theme;
    const song:SongResult={id:String(index),name:index===1?'岛屿来信':'另一首测试歌曲',artists:[{id:1,name:'听屿测试歌手'}],album:{id:1,name:'海风与唱片',coverUrl:''},durationMs:240000,sourceRef:{kind:'online',providerId:'netease',mediaId:String(index)}};
    const playback={isOpen:open,currentTab:tab,onTabChange:setTab,onToggle:()=>setOpen(false),currentSong:song,coverUrl:null,theme,onAlbumSelect:noop,onSelectArtist:noop,loopMode:'all',onToggleLoop:noop,onLike:noop,isLiked:false,onGenerateAITheme:noop,isGeneratingTheme:false,hasLyrics:true,canGenerateAITheme:false,visualizerMode:'classic',onMatchOnline:()=>setMatched(v=>v+1),onMatchOnlineLyrics:()=>setMatched(v=>v+1),onUpdateLocalLyrics:noop,onChangeLyricsSource:noop,
        onlineLyricsState:{lyricsSource:source,importedLyrics:file?{lines:[],isWordByWord:false}:null,hasOnlineOverride:false} as OnlineLyricsState,
        onImportOnlineLyrics:(content:string,name:string)=>{setFile(name+':'+content);setSource('imported');},onChangeOnlineLyricsSource:setSource,onClearOnlineLyricsState:()=>{setFile('');setSource('online');},lyricTimelineOffsetMs:offset,onLyricTimelineOffsetChange:setOffset,replayGainMode:'off',onChangeReplayGainMode:noop,isFmMode:false,onNextTrack:()=>{setIndex(v=>v+1);setOffset(0);},onPrevTrack:noop,playerState:playing?PlayerState.PLAYING:PlayerState.PAUSED,onTogglePlay:()=>setPlaying(v=>!v),volume:.6,onVolumeChange:noop,isMuted:false,playbackControlsDisabled:false} as unknown as UnifiedPanelProps['playback'];
    const props={playback,queue:{playQueue:[song],onPlaySong:noop,queueScrollRef:scroll,onShuffle:noop,onRemoveSong:noop,onMoveSongToEnd:noop,onMoveSongToNext:noop},library:{onSaveCurrentQueueAsPlaylist:async()=>{},onOpenCurrentLocalAlbum:noop,onOpenCurrentLocalArtist:noop,onOpenCurrentNavidromeAlbum:noop,onOpenCurrentNavidromeArtist:noop,onCopySongInfoSuccess:noop},account:{isDaylight:false}} as unknown as UnifiedPanelProps;
    window.__mobileToolsProbe={next:()=>{setIndex(v=>v+1);setOffset(0);},state:()=>({offset,source,matched,file,index})};
    return <div style={{height:'100dvh',background:'#06140e',padding:24,color:'#f0f5ec'}}><h1>听屿</h1><p>手机歌曲工具 · 测试数据</p><button onClick={()=>setOpen(true)}>打开歌曲工具</button><UnifiedPanel {...props}/></div>;
}
export default {id:'mobileSongTools',title:'Tingyu mobile song and lyric tools',description:'Touch controls, source selection, import, timing and song-change isolation.',Component:Probe} satisfies ProbeDefinition;

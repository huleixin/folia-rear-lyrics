import ThemedDialog from '../../src/components/shared/ThemedDialog';
import React,{useRef,useState} from 'react';
import InterfaceAppearanceSetting from '../../src/components/modal/settings/InterfaceAppearanceSetting';
import {ResourceCacheCard} from '../../src/components/modal/settings/SmartResourceCacheSettings';
import SleepTimerSheet from '../../src/components/modal/SleepTimerSheet';
import {useInterfaceAppearanceSync} from '../../src/hooks/useInterfaceAppearance';
import {useThemeSettingsStore} from '../../src/stores/useThemeSettingsStore';
import '../../src/components/modal/settings/mobileSettings.css';
import type {ProbeDefinition} from './definition';

// dev/probes/interfaceAppearance.probe.tsx
function Component(){
    useInterfaceAppearanceSync();
    const [sheet,setSheet]=useState(false),[dialog,setDialog]=useState(false);
    const mountId=useRef(Math.random());
    return <div className="font-sans" data-folia-settings-overlay data-mobile-settings="true" style={{minHeight:'100dvh',color:'var(--text-primary)',background:'#031510','--text-primary':'#f4f7f5','--text-secondary':'#a2b6ac','--text-accent':'#9fe0c4'} as React.CSSProperties}>
        <main data-folia-settings-panel style={{minHeight:'100dvh',padding:20,maxWidth:560,margin:'auto'}}>
            <h1 className="ty-settings-header" style={{padding:0,marginBottom:20}}>外观与存储</h1>
            <InterfaceAppearanceSetting/>
            <input aria-label="保留的搜索内容" placeholder="搜索音乐" style={{margin:'20px 0',padding:12,width:'100%',background:'transparent',border:'1px solid currentColor',borderRadius:14}}/>
            <button onClick={()=>setSheet(true)} style={{minHeight:48}}>定时关闭</button>
            <button onClick={()=>setDialog(true)} style={{minHeight:48}}>普通弹窗</button>
            <output hidden data-testid="mount-id">{mountId.current}</output>
            <output hidden data-testid="stage-state">{String(useThemeSettingsStore.getState().isDaylight)}</output>
            <ResourceCacheCard status={{enabled:true,wifiOnly:false,lyricsBytes:17400000,artworkBytes:9600000,total:396,completed:72,failed:0,cachedSongs:455,pending:324,metadataComplete:true,discovered:396,paused:false,networkAllowed:true,jobState:'scheduled',nextDue:0,platformPending:200,lastError:''}} busy={false} error="" update={async()=>{}}/>
        </main>
        {sheet&&<SleepTimerSheet/>}
        <ThemedDialog isOpen={dialog} isDaylight={false} onClose={()=>setDialog(false)} title="普通弹窗"><p>复用同一份界面主题</p></ThemedDialog>
        <div data-testid="player-visual-surface" style={{color:'#ffeebb',background:'#121523'}}>舞台主题保持独立</div>
    </div>;
}
export default {id:'interfaceAppearance',title:'三档外观',description:'原生桥接边界、主题状态、弹层和缓存卡片',Component} satisfies ProbeDefinition;

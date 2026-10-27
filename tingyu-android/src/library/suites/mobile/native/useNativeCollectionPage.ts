import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryCollectionSurfaceProps } from '../../../core/contracts/suite';
import type { useMobileCollection } from '../useMobileCollection';
import type { SongResult } from '../../../../types';
import type { NativePageModel, PageActions, PageSection } from '../../../../types/nativePages';
import { useNativePage } from '../../../../hooks/useNativePage';
import { absolutePageImage } from '../../../../services/nativePages';
import { getSongArtistLabel, getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { isSongUnavailable } from '../../../../services/onlineMusic/songAvailability';
import { pageRowActions } from '../../../../utils/nativePageActions';
import { usePlaybackStore, selectDisplaySong } from '../../../../stores/usePlaybackStore';

// src/library/suites/mobile/native/useNativeCollectionPage.ts
export function useNativeCollectionPage(root:RefObject<HTMLElement|null>,props:LibraryCollectionSurfaceProps,model:ReturnType<typeof useMobileCollection>,
    name:string,count:number,onSongMenu:(song:SongResult,index:number)=>void,onCollectionMenu:()=>void,onSubscribe:()=>void) {
    const {t}=useTranslation();const [offset,setOffset]=useState(0);
    const active=usePlaybackStore(selectDisplaySong),activeKey=active?getPlaybackSongKey(active):'';
    const indexes=model.view.matchIndexes;
    const total=indexes?.length??model.view.displayTracks.length;
    const actions:PageActions={back:props.onBack,menu:onCollectionMenu,playAll:model.actions.playScope,enqueueAll:model.actions.enqueueScope,
        reload:model.actions.reload,resume:model.actions.resumeSync,subscribe:onSubscribe,
        filter:e=>{model.setQuery(e.text??'');setOffset(0)},range:e=>setOffset(Math.max(0,Math.floor((e.value??0)/100)*100))};
    const items=Array.from({length:Math.max(0,Math.min(100,total-offset))},(_,local)=>{
        const index=indexes?.[offset+local]??offset+local,song=model.view.displayTracks[index],key=getPlaybackSongKey(song);
        return{id:`${index}:${key}`,title:`${index+1}. ${song.name}`,subtitle:getSongArtistLabel(song),image:absolutePageImage(getSongCoverUrl(song)),
            action:`play:${index}:${key}`,secondary:`menu:${index}:${key}`,secondaryLabel:'⋮',disabled:isSongUnavailable(song),selected:key===activeKey};
    });
    const controls=[{id:'play',title:t('mobileLibrary.playAll'),action:'playAll',disabled:!model.actions.capabilities.scope.enabled},
        {id:'queue',title:t('mobileLibrary.enqueue'),action:'enqueueAll',disabled:!model.actions.capabilities.scope.enabled}];
    if(model.mutations.capabilities.subscribe.supported)controls.push({id:'subscribe',title:t(model.mutations.subscribed?'mobileLibrary.saved':'mobileLibrary.save'),action:'subscribe',disabled:!model.mutations.capabilities.subscribe.enabled});
    const sections:PageSection[]=[{id:'intro',layout:'rows',items:[{id:'cover',title:name,subtitle:t('mobileLibrary.trackCount',{count}),
        image:absolutePageImage(model.snapshot?.detail?.coverUrl||props.collection.coverUrl),action:'playAll'}]},
        {id:'controls',layout:'chips',items:controls},
        {id:'filter',layout:'input',value:model.query,placeholder:t('mobileLibrary.filter'),action:'filter'},
        {id:'tracks',key:`${model.query}:${model.field}:${model.direction}`,layout:'rows',total,offset,request:'range',items}];
    if(!total)sections.push({id:'empty',layout:'message',text:t(model.snapshot?.status==='loading'?'mobileLibrary.loading':'mobileLibrary.emptyCollection')});
    if(model.snapshot?.error)sections.push({id:'error',layout:'message',text:model.snapshot.error.kind==='generic'?model.snapshot.error.message:t('mobileLibrary.loadFailed'),more:'reload',moreLabel:t('mobileLibrary.retry')});
    if(model.snapshot?.sync.status==='interrupted')sections.push({id:'resume',layout:'message',more:'resume',moreLabel:t('mobileLibrary.resumeSync')});
    const nativeModel:NativePageModel={key:`collection:${model.sessionKey}`,title:name,leading:'back',trailing:'menu',trailingLabel:'⋯',bottomClearance:100,sections};
    return useNativePage(root,'collection',props.isInteractive,nativeModel,pageRowActions(actions,id=>{
        const match=/^(play|menu):(\d+):(.*)$/.exec(id);if(!match)return;
        const index=Number(match[2]),song=model.view.displayTracks[index];if(!song||getPlaybackSongKey(song)!==match[3])return;
        return()=>match[1]==='play'?model.playTrack(song):onSongMenu(song,index);
    }));
}

import { useEffect,useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryCollectionSurfaceProps } from '../../../core/contracts/suite';
import type { useMobileCollection } from '../useMobileCollection';
import type { SongResult } from '../../../../types';
import type { NativePageModel, PageActions, PageSection } from '../../../../types/nativePages';
import { useNativePage } from '../../../../hooks/useNativePage';
import { absolutePageImage } from '../../../../services/nativePages';
import { getSongArtistLabel, getSongCoverUrl, getSongDurationMs } from '../../../../services/onlineMusic/songMetadata';
import { formatTime } from '../../../../utils/appPlaybackHelpers';
import { omni } from '../../../../services/onlineMusic/omni';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { isSongUnavailable } from '../../../../services/onlineMusic/songAvailability';
import { pageRowActions } from '../../../../utils/nativePageActions';
import { usePlaybackStore, selectDisplaySong,selectDisplayPlayerState } from '../../../../stores/usePlaybackStore';
import {PlayerState} from '../../../../types';
import { NATIVE_FIRST } from '../../../../services/nativePages';
import { useCollectionNavigationStore } from '../../../../stores/useCollectionNavigationStore';
import { useAppViewStore } from '../../../../stores/useAppViewStore';
import { useSettingsModalStore } from '../../../../stores/useSettingsModalStore';
import { collectionKey } from '../../../core/model/collectionIdentity';

// src/library/suites/mobile/native/useNativeCollectionPage.ts
export function useNativeCollectionPage(root:RefObject<HTMLElement|null>,props:LibraryCollectionSurfaceProps,model:ReturnType<typeof useMobileCollection>,
    name:string,count:number,onSongMenu:(song:SongResult,index:number)=>void,onCollectionMenu:()=>void,onSubscribe:()=>void) {
    const {t}=useTranslation();const [offset,setOffset]=useState(0),[filterOpen,setFilterOpen]=useState(false);
    const top=useCollectionNavigationStore(state=>state.snapshot?.stack.at(-1));
    const browsing=useAppViewStore(state=>state.view!=='player');
    const settings=useSettingsModalStore(state=>state.settingsModalState.isOpen);
    const interactive=NATIVE_FIRST?browsing&&!settings&&!!top&&collectionKey(top)===collectionKey(props.collection):props.isInteractive;
    const active=usePlaybackStore(selectDisplaySong),activeKey=active?getPlaybackSongKey(active):'';
    const indexes=model.view.matchIndexes;
    const total=indexes?.length??model.view.displayTracks.length;
    const playing=usePlaybackStore(selectDisplayPlayerState)===PlayerState.PLAYING;
    const originalActive=model.view.displayTracks.findIndex(song=>getPlaybackSongKey(song)===activeKey);
    const activeIndex=indexes?indexes.indexOf(originalActive):originalActive;
    const [locateRevision,setLocateRevision]=useState(0),[pendingLocate,setPendingLocate]=useState('');
    const locate=()=>{if(originalActive<0)return;if(activeIndex<0){setPendingLocate(activeKey);model.setQuery('');setFilterOpen(false)}
        else {setOffset(Math.floor(activeIndex/100)*100);setLocateRevision(value=>value+1)}};
    useEffect(()=>{if(pendingLocate&&pendingLocate===activeKey&&activeIndex>=0){setPendingLocate('');locate()}},[pendingLocate,activeKey,activeIndex]);
    const actions:PageActions={back:props.onBack,menu:onCollectionMenu,playAll:model.actions.playScope,enqueueAll:model.actions.enqueueScope,
        reload:model.actions.reload,resume:model.actions.resumeSync,subscribe:onSubscribe,locateCurrent:locate,
        filterToggle:()=>setFilterOpen(value=>!value),filter:e=>{model.setQuery(e.text??'');setOffset(0)},range:e=>setOffset(Math.max(0,Math.floor((e.value??0)/100)*100))};
    const items=Array.from({length:Math.max(0,Math.min(100,total-offset))},(_,local)=>{
        const index=indexes?.[offset+local]??offset+local,song=model.view.displayTracks[index],key=getPlaybackSongKey(song);
        return{id:`${index}:${key}`,title:props.collection.type==='playlist'?song.name:`${index+1}. ${song.name}`,number:String(index+1).padStart(2,'0'),duration:formatTime(getSongDurationMs(song)/1000),subtitle:getSongArtistLabel(song),image:absolutePageImage(getSongCoverUrl(song)),
            action:`play:${index}:${key}`,secondary:`menu:${index}:${key}`,secondaryLabel:t('mobileLibrary.trackActions',{name:song.name}),disabled:isSongUnavailable(song),selected:key===activeKey};
    });
    const controls=[{id:'play',title:t('mobileLibrary.playAll'),action:'playAll',disabled:!model.actions.capabilities.scope.enabled}];
    if(model.actions.capabilities.scope.supported)controls.push({id:'queue',title:t('mobileLibrary.enqueue'),action:'enqueueAll',disabled:!model.actions.capabilities.scope.enabled});
    if(model.mutations.capabilities.subscribe.supported)controls.push({id:'subscribe',title:t(model.mutations.subscribed?'mobileLibrary.saved':'mobileLibrary.save'),action:'subscribe',disabled:!model.mutations.capabilities.subscribe.enabled});
    const creator=model.snapshot?.detail?.creator??props.collection.creator;
    const source=props.collection.source==='online'?omni.getProviderLabel(props.collection.providerId):t(props.collection.source==='local'?'search.sourceLocal':'search.sourceNavidrome');
    const sections:PageSection[]=[...(props.collection.type==='playlist'?[{id:'toolbar',layout:'chips' as const,items:[
        {id:'back',title:t('mobileLibrary.back'),action:'back'},{id:'filterToggle',title:t('mobileLibrary.filter'),action:'filterToggle'},
        {id:'menu',title:t('mobileLibrary.playlistActions'),action:'menu'},
        ...(originalActive>=0?[{id:'locateCurrent',title:t('mobileLibrary.locateCurrent'),action:'locateCurrent'}]:[])]}]:[]),
        {id:props.collection.type==='playlist'?'playlistIntro':'intro',layout:'rows',description:model.snapshot?.detail?.description||props.collection.description,
        creator:creator?.nickname||source,creatorImage:absolutePageImage(creator?.avatarUrl),items:[{id:'cover',title:name,subtitle:t('mobileLibrary.trackCount',{count}),
        image:absolutePageImage(model.snapshot?.detail?.coverUrl||props.collection.coverUrl),action:'playAll'}]},
        {id:'controls',layout:'chips',items:controls.map(item=>({...item,selected:item.id==='subscribe'&&!!model.mutations.subscribed}))},
        ...(props.collection.type==='playlist'?[{id:'songHeading',layout:'message' as const,title:t('mobileLibrary.playlistSongs'),text:String(count)}]:[]),
        ...(props.collection.type!=='playlist'||filterOpen||model.query?[{id:'filter',layout:'input' as const,value:model.query,placeholder:t('mobileLibrary.filter'),action:'filter'}]:[]),
        {id:'tracks',key:`${model.query}:${model.field}:${model.direction}`,layout:'rows',total,offset,request:'range',items,
            activeKey,playing,activeIndex,locateRevision}];
    if(!total)sections.push({id:'empty',layout:'message',text:t(model.snapshot?.status==='loading'?'mobileLibrary.loading':'mobileLibrary.emptyCollection')});
    if(model.snapshot?.error)sections.push({id:'error',layout:'message',text:model.snapshot.error.kind==='generic'?model.snapshot.error.message:t('mobileLibrary.loadFailed'),more:'reload',moreLabel:t('mobileLibrary.retry')});
    if(model.snapshot?.sync.status==='interrupted')sections.push({id:'resume',layout:'message',more:'resume',moreLabel:t('mobileLibrary.resumeSync')});
    const nativeModel:NativePageModel={key:`collection:${model.sessionKey}`,title:name,leading:'back',trailing:'menu',trailingLabel:'⋯',bottomClearance:100,sections};
    return useNativePage(root,'collection',interactive,nativeModel,pageRowActions(actions,id=>{
        const match=/^(play|menu):(\d+):(.*)$/.exec(id);if(!match)return;
        const index=Number(match[2]),song=model.view.displayTracks[index];if(!song||getPlaybackSongKey(song)!==match[3])return;
        return()=>match[1]==='play'?model.playTrack(song):onSongMenu(song,index);
    }));
}

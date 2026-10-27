import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { SongResult } from '../../../../types';
import type { LibraryArtistSurfaceProps } from '../../../core/contracts/suite';
import type { useArtistView } from '../../../core/bindings/useArtistView';
import type { useCollectionView } from '../../../core/bindings/useCollectionView';
import { useNativePage } from '../../../../hooks/useNativePage';
import { absolutePageImage } from '../../../../services/nativePages';
import { getSongArtistLabel, getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { isSongUnavailable } from '../../../../services/onlineMusic/songAvailability';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { pageRowActions } from '../../../../utils/nativePageActions';
import type { NativePageModel, PageActions, PageSection } from '../../../../types/nativePages';

// src/library/suites/mobile/native/useNativeArtistPage.ts
export function useNativeArtistPage(root:RefObject<HTMLElement|null>,props:LibraryArtistSurfaceProps,
    model:ReturnType<typeof useArtistView>,tracks:ReturnType<typeof useCollectionView>,tab:'songs'|'albums',
    selectTab:(tab:'songs'|'albums')=>void,play:(song:SongResult)=>void,menu:(song:SongResult|'artist')=>void) {
    const {t}=useTranslation(),[offset,setOffset]=useState(0);
    const snapshot=props.resource?.getSnapshot();
    const actions:PageActions={back:props.onBack,menu:()=>menu('artist'),playAll:model.actions.playScope,reload:model.actions.reload,
        resume:model.actions.retryAlbums,filter:e=>{model.setQuery(e.text??'');setOffset(0)},
        songs:()=>{setOffset(0);selectTab('songs')},albums:()=>{setOffset(0);selectTab('albums')},
        range:e=>setOffset(Math.max(0,Math.floor((e.value??0)/100)*100))};
    const total=tab==='albums'?model.shownAlbums.length:tracks.matchIndexes?.length??tracks.displayTracks.length;
    const items=Array.from({length:Math.max(0,Math.min(100,total-offset))},(_,local)=>{
        const index=offset+local;
        if(tab==='albums') {const album=model.shownAlbums[index];return{id:String(album.id),title:album.name,image:absolutePageImage(album.coverUrl),action:`album:${index}:${album.id}`}}
        const song=tracks.displayTracks[tracks.matchIndexes?.[index]??index],key=getPlaybackSongKey(song);
        return{id:key,title:song.name,subtitle:getSongArtistLabel(song),image:absolutePageImage(getSongCoverUrl(song)),
            action:`play:${index}:${key}`,secondary:`menu:${index}:${key}`,secondaryLabel:'⋮',disabled:isSongUnavailable(song)};
    });
    const sections:PageSection[]=[{id:'play',layout:'chips',items:[{id:'play',title:t('mobileLibrary.playAll'),action:'playAll',disabled:!model.playableTopSongs.length}]},
        {id:'tabs',layout:'chips',items:[{id:'songs',title:t('mobileLibrary.topSongs'),action:'songs',selected:tab==='songs'},
            {id:'albums',title:t('mobileLibrary.albums',{count:model.albums.length}),action:'albums',selected:tab==='albums'}]},
        {id:'filter',layout:'input',value:model.query,placeholder:t('mobileLibrary.filterArtist'),action:'filter'},
        {id:'items',key:`${tab}:${model.query}`,layout:'rows',total,offset,items,request:'range'}];
    sections.unshift({id:'intro',layout:'rows',items:[{id:'cover',title:snapshot?.detail?.name||props.collection.name,
        subtitle:snapshot?.detail?.description||props.collection.description,image:absolutePageImage(snapshot?.detail?.coverUrl||props.collection.coverUrl)}]});
    if(!total)sections.push({id:'empty',layout:'message',text:t(!snapshot||snapshot.status==='loading'||snapshot.status==='idle'?'mobileLibrary.loading':'mobileLibrary.emptyCollection')});
    if(snapshot?.status==='error')sections.push({id:'error',layout:'message',text:t('mobileLibrary.loadFailed'),more:'reload',moreLabel:t('mobileLibrary.retry')});
    if(snapshot?.albumSync.state==='interrupted')sections.push({id:'resume',layout:'message',more:'resume',moreLabel:t('mobileLibrary.resumeSync')});
    const page:NativePageModel={key:`collection:artist:${model.sessionKey}`,title:snapshot?.detail?.name||props.collection.name,
        leading:'back',trailing:'menu',trailingLabel:'⋯',sections,bottomClearance:100};
    return useNativePage(root,'collection',props.isInteractive,page,pageRowActions(actions,id=>{
        const album=/^album:(\d+):(.+)$/.exec(id);
        if(album){const item=model.shownAlbums[Number(album[1])];if(item&&String(item.id)===album[2])return()=>model.actions.openAlbum(item);return;}
        const song=/^(play|menu):(\d+):(.+)$/.exec(id);if(!song)return;
        const index=Number(song[2]),item=tracks.displayTracks[tracks.matchIndexes?.[index]??index];if(!item||getPlaybackSongKey(item)!==song[3])return;
        return()=>{if(song[1]==='menu')menu(item);else if(!isSongUnavailable(item))play(item)};
    }));
}

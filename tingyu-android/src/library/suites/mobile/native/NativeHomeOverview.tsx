import React, { useMemo, useState, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../../core/contracts/suite';
import type { LibraryHomeSources } from '../../../core/bindings/useLibraryHomeSources';
import type { LibraryHomeCard } from '../../../core/contracts/homeModel';
import { useLibraryHomeOnline } from '../../../core/bindings/useLibraryHomeOnline';
import { buildOnlinePlaylistCards, isPersonalFmCard } from '../../../core/model/homeCards';
import { collectionKey } from '../../../core/model/collectionIdentity';
import { useMobileLibraryStore } from '../../../../stores/useMobileLibraryStore';
import { useLibraryTrackPlayback } from '../../../../hooks/useLibraryTrackPlayback';
import { useNativePage } from '../../../../hooks/useNativePage';
import { useNewReleaseChart } from '../../../../hooks/useNewReleaseChart';
import { absolutePageImage } from '../../../../services/nativePages';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { getSongArtistLabel, getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { isSongUnavailable } from '../../../../services/onlineMusic/songAvailability';
import type { NativePageModel, PageActions, PageSection } from '../../../../types/nativePages';
import MobileSheet from '../MobileSheet';
import type { SongResult } from '../../../../types';

// src/library/suites/mobile/native/NativeHomeOverview.tsx
export type NativeHomeProps = { root: RefObject<HTMLElement|null>; props: LibraryHomeSurfaceProps;
    sources: LibraryHomeSources; onReady: (ready:boolean)=>void; onSources:()=>void };
export default function NativeHomeOverview({root,props,sources,onReady,onSources}:NativeHomeProps) {
    const {t}=useTranslation();
    const online=useLibraryHomeOnline(props.homeResources,{...sources,tab:'radio'});
    const chart=useNewReleaseChart(sources.online.providerId);
    const recent=useMobileLibraryStore(s=>s.recentTracks);
    const play=useLibraryTrackPlayback(props.onPlaySong,props.onTogglePlayback);
    const playlists=useMemo(()=>buildOnlinePlaylistCards(sources.online.collections,t),[sources.online.collections,t]);
    const [all,setAll]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
    const [menu,setMenu]=useState<{kind:'track';song:SongResult}|{kind:'playlist';card:LibraryHomeCard}|null>(null);
    const pending=useRef(false),provider=useRef(sources.online.providerId);provider.current=sources.online.providerId;
    const open=async(card:LibraryHomeCard,autoplay=false)=>{
        if(pending.current||sources.online.accountView==='resolving')return;
        if((isPersonalFmCard(card)||card.type==='daily_recommendations')&&(!sources.online.user||sources.online.needsRelogin)){
            void props.account.startLogin(sources.online.providerId);return;
        }
        pending.current=true;setBusy(true);setNotice('');
        try{const result=await props.homeResources.actions.openOnlineCard(card,sources.online.providerId,collection=>{
            if(provider.current!==sources.online.providerId)return;
            if(autoplay)useMobileLibraryStore.getState().requestCollectionPlay(collectionKey(collection));
            props.onOpenGridView(collection);
        });if(!result.ok)setNotice(t('mobileLibrary.recommendationUnavailable'));}
        catch{setNotice(t('mobileLibrary.recommendationUnavailable'));}finally{pending.current=false;setBusy(false)}
    };
    const actions:PageActions={sources:onSources,all:()=>setAll(!all),library:()=>{sources.setTab('playlist');useMobileLibraryStore.getState().setPage('library')}};
    const sections:PageSection[]=[];
    if(!all){
        const cards=[online.items.find(isPersonalFmCard),online.items.find(c=>c.type==='daily_recommendations'),
            chart.supported&&chart.collection?{...chart.collection,raw:chart.collection}:undefined];
        const names=[`${t('mobileLibrary.guessLineOne')}\n${t('mobileLibrary.guessLineTwo')}`,`${t('mobileLibrary.dailyHeading')}\n${t('mobileLibrary.dailyCountHeading')}`,t('mobileLibrary.newReleases')];
        sections.push({id:'hero',layout:'hero',items:['guess-you-like','daily-30','new-releases'].map((kind,index)=>{
            const card=cards[index];actions[`hero:${kind}`]=()=>{if(card)void open(card,true);else chart.retry()};
            return{id:kind,title:names[index],subtitle:t(['mobileLibrary.personalRadioDescription','mobileLibrary.dailyDescription','mobileLibrary.newReleasesDescription'][index]),
                image:absolutePageImage(`/assets/mobile-home/${kind}.png`),action:`hero:${kind}`,
                secondaryLabel:index===2&&!card&&chart.supported?t(chart.status==='error'?'search.retry':'mobileLibrary.loading'):undefined,
                disabled:busy||sources.online.accountView==='resolving'||(!card&&!(index===2&&chart.supported&&chart.status==='error'))};
        })});
    }
    sections.push({id:'recent',title:t('mobileLibrary.recent'),layout:all?'rows':'cards',more:'all',moreLabel:t(all?'mobileLibrary.back':'mobileLibrary.all'),items:recent.slice(0,all?100:12).map((song,index)=>{
        const key=`recent:${index}:${getPlaybackSongKey(song)}`;actions[key]=()=>play(song,recent);actions[`${key}:menu`]=()=>setMenu({kind:'track',song});
        return{id:key,title:song.name,subtitle:getSongArtistLabel(song),image:absolutePageImage(getSongCoverUrl(song)),action:key,disabled:isSongUnavailable(song),secondary:`${key}:menu`,secondaryLabel:'⋮'};
    })});
    if(!recent.length)sections.push({id:'recent-empty',layout:'message',text:t('mobileLibrary.noRecent')});
    if(!all){
        sections.push({id:'playlists',title:t('mobileLibrary.myPlaylists'),layout:'cards',more:'library',moreLabel:t('mobileLibrary.all'),items:playlists.slice(0,4).map((card,index)=>{
            const key=`playlist:${index}:${card.id}`;actions[key]=()=>{void open(card)};actions[`${key}:menu`]=()=>setMenu({kind:'playlist',card});
            return{id:key,title:card.name,subtitle:card.trackCount!=null?t('mobileLibrary.trackCount',{count:card.trackCount}):card.description,
                image:absolutePageImage(card.coverUrl),action:key,secondary:`${key}:menu`,secondaryLabel:'⋮'};
        })});
        if(!playlists.length)sections.push({id:'playlist-empty',layout:'message',text:t('mobileLibrary.noPlaylists')});
    }
    if(notice)sections.push({id:'notice',layout:'message',text:notice});
    const model:NativePageModel={key:`home:${sources.online.providerId}:${sources.online.user?.id??''}:${all}`,title:t('mobileLibrary.recommend'),
        subtitle:t('mobileLibrary.discoverMoreMusic'),trailing:'sources',trailingLabel:sources.online.providerLabel,background:'home',bottomClearance:152,topPadding:32,sections};
    useNativePage(root,'home',props.isInteractive,model,actions,onReady);
    return menu?<MobileSheet title={menu.kind==='track'?menu.song.name:menu.card.name} onClose={()=>setMenu(null)}>
        {menu.kind==='track'?<>
            <button className="ml-sheet-action" disabled={isSongUnavailable(menu.song)} onClick={()=>{play(menu.song,recent);setMenu(null)}}>{t('mobileLibrary.play')}</button>
            {props.onAddSongToQueue&&<button className="ml-sheet-action" disabled={isSongUnavailable(menu.song)} onClick={()=>{props.onAddSongToQueue?.(menu.song);setMenu(null)}}>{t('mobileLibrary.enqueue')}</button>}
        </>:<>
            <button className="ml-sheet-action" onClick={()=>{void open(menu.card);setMenu(null)}}>{t('mobileLibrary.openPlaylist',{name:menu.card.name})}</button>
            <button className="ml-sheet-action" onClick={()=>{void open(menu.card,true);setMenu(null)}}>{t('mobileLibrary.playAll')}</button>
        </>}
    </MobileSheet>:null;
}

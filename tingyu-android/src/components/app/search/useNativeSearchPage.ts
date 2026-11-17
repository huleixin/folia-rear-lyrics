import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedSong } from '../../../types';
import type { MediaId } from '../../../types/onlineMusic';
import type { SearchArtistHit, SearchAlbumHit, SearchPlaylistHit, SearchSuggestion } from '../../../types/search';
import type { SearchSource } from '../../../stores/useSearchNavigationStore';
import type { ExploreCategory, ExploreKind } from '../../../stores/useSearchExploreStore';
import { useSearchHistoryStore } from '../../../stores/useSearchHistoryStore';
import { useNativePage } from '../../../hooks/useNativePage';
import { NATIVE_FIRST, absolutePageImage } from '../../../services/nativePages';
import { getProviderSongMetadata } from '../../../services/onlineMusic/songMetadata';
import { canResolveSongCatalogRef } from '../../../services/onlineMusic/catalogRefs';
import { isSongUnavailable } from '../../../services/onlineMusic/songAvailability';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { pageRowActions } from '../../../utils/nativePageActions';
import type { NativePageModel, PageActions, PageItem, PageSection } from '../../../types/nativePages';
import { loadSearchDiscovery } from './SearchLanding';
import type { SearchDiscovery } from '../../../services/search/searchAuxiliary';
import { useSearchAuxiliaryKey } from './useSearchAuxiliaryKey';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';
import { PlayerState } from '../../../types';
import { groupMusicSources } from '../../../services/musicIdentity';
import { bestSearchMatch } from '../../../services/search/searchRanking';
import { nativeSearchGroupItem, nativeSearchSongItem, searchDisplayPlaybackKey } from './nativeSearchSongs';
import type { SourcePages } from '../../../services/search/aggregateSearch';
import { searchSourceStatus } from './searchSourceStatus';

// src/components/app/search/useNativeSearchPage.ts
// Presentation only: playback, source selection, discovery and pagination retain their existing owners.
type Tab = 'overview' | 'song' | ExploreKind;
type Hit = SearchArtistHit | SearchAlbumHit | SearchPlaylistHit;
type Props = {
    root: RefObject<HTMLElement | null>; active: boolean; query: string; source: SearchSource;
    mode: 'landing'|'suggest'|'results'; tab: Tab; tabs: Tab[]; sources: SearchSource[];
    results: UnifiedSong[]; searching: boolean; loadingMore: boolean; error: string|null;
    hasMore: boolean; needsSetup: boolean; sourcePages?: SourcePages<UnifiedSong>;
    clearHistory?(): void;
    artists: ExploreCategory<SearchArtistHit>; albums: ExploreCategory<SearchAlbumHit>; playlists: ExploreCategory<SearchPlaylistHit>;
    suggestions: { items: SearchSuggestion[]; status: string }; historyMatches: string[];
    close():void; change(text:string,composing:boolean):void; submit(text?:string):void; selectTab(tab:Tab):void;
    switchSource(source:SearchSource):void; sourceLabel(source:SearchSource):string; loadMore():void;
    loadExplore(kind:ExploreKind):void; openHit(kind:ExploreKind,hit:Hit):void;
    openMenu?(song:UnifiedSong):void; play(song:UnifiedSong):void; enqueue(song:UnifiedSong):void;
    openArtist(song:UnifiedSong,name:string,id?:MediaId,entityId?:string):void;
    openAlbum(song:UnifiedSong,name:string,id?:MediaId,entityId?:string):void;
};
const EMPTY: string[]=[];
export function useNativeSearchPage(p: Props) {
    const {t}=useTranslation();
    const activeKey=usePlaybackStore(s=>s.activePlaybackContext==='main'&&s.currentSong?getPlaybackSongKey(s.currentSong):'');
    const pendingKey=usePlaybackStore(s=>s.pendingSongKey);
    const playing=usePlaybackStore(s=>s.playerState===PlayerState.PLAYING);
    const [offset,setOffset]=useState(0);
    const [menu,setMenu]=useState<UnifiedSong|null>(null);
    const [sourceGroupKey,setSourceGroupKey]=useState<string|null>(null);
    const groups=useMemo(()=>groupMusicSources(p.results),[p.results]);
    const best=useMemo(()=>bestSearchMatch(p.query,p.results,p.artists.items,p.albums.items,p.playlists.items),
        [p.query,p.results,p.artists.items,p.albums.items,p.playlists.items]);
    const callbacks={play:p.play,menu:(song:UnifiedSong)=>{if(p.openMenu)p.openMenu(song);else setMenu(song)},label:p.sourceLabel};
    const discoveryScope=useSearchAuxiliaryKey(p.source,'discovery');
    const [discoverySnapshot,setDiscoverySnapshot]=useState<{key:string;data:SearchDiscovery}|null>(null);
    const discovery=discoverySnapshot?.key===discoveryScope?discoverySnapshot.data:null;
    const [discoveryError,setDiscoveryError]=useState(false);
    const [retry,setRetry]=useState(0);
    const [hotExpanded,setHotExpanded]=useState(false);
    const terms=useSearchHistoryStore(s=>s.terms[p.source]??EMPTY);
    useEffect(()=>{setOffset(0);setMenu(null);setSourceGroupKey(null)},[p.source,p.query,p.tab,p.active]);
    useEffect(()=>{
        if(!NATIVE_FIRST||!p.active||p.query.trim())return;
        let alive=true;setDiscoverySnapshot(null);setDiscoveryError(false);setHotExpanded(false);
        if(p.source!=='local'&&p.source!=='navidrome')void loadSearchDiscovery(p.source)
            .then(value=>{if(alive)setDiscoverySnapshot({key:discoveryScope,data:value})}).catch(()=>{if(alive)setDiscoveryError(true)});
        return()=>{alive=false};
    },[p.source,p.active,p.query,retry,discoveryScope]);
    useEffect(()=>{
        if((!menu&&!sourceGroupKey)||!p.active)return;
        const back=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setMenu(null);setSourceGroupKey(null)}};
        window.addEventListener('keydown',back,true);return()=>window.removeEventListener('keydown',back,true);
    },[menu,sourceGroupKey,p.active]);
    const actions:PageActions={close:p.close,change:event=>p.change(event.text??'',event.value===1),submit:event=>p.submit(event.text),
        range:event=>setOffset(Math.max(0,Math.floor((event.value??0)/100)*100)),
        retry:()=>p.submit(),more:p.loadMore,settings:()=>useSettingsModalStore.getState().openSettings('options','search'),
        clearHistory:()=>p.clearHistory?.(),discoveryRetry:()=>setRetry(v=>v+1),back:()=>{setMenu(null);setSourceGroupKey(null)},hotExpand:()=>setHotExpanded(value=>!value)};
    const sections:PageSection[]=[{id:'query',layout:'input',value:p.query,placeholder:t('search.placeholder'),action:'change',submit:'submit'},
        {id:'sources',layout:'chips',items:p.sources.map(source=>{
            actions[`source:${source}`]=()=>p.switchSource(source);
            return{id:source,title:p.sourceLabel(source),action:`source:${source}`,selected:source===p.source};
        })}];
    const words=(id:string,title:string,words:string[],history=false)=>{
        if(!words.length)return;
        sections.push({id,title,layout:history?'rows':'chips',more:history?'clearHistory':undefined,moreLabel:history?t('mobileEnhancements.clearHistory'):undefined,
            items:words.map((word,index)=>{
                actions[`${id}:${index}`]=()=>p.submit(word);
                if(history)actions[`${id}:remove:${index}`]=()=>useSearchHistoryStore.getState().remove(p.source,word);
                return{id:`${index}:${word}`,title:word,action:`${id}:${index}`,secondary:history?`${id}:remove:${index}`:undefined,secondaryLabel:history?'×':undefined};
            })});
    };
    if(!p.query.trim()) {
        words('history',t('mobileEnhancements.history'),terms,true);
        words('discovery',t('mobileEnhancements.discover'),discovery?.suggestions??[]);
        words('hot',[t('mobileEnhancements.hotSearch'),discovery?.providerId?p.sourceLabel(discovery.providerId):''].filter(Boolean).join(' · '),discovery?.hot.slice(0,hotExpanded?undefined:10)??[]);
        if(discovery&&discovery.hot.length>10){const hot=sections.find(section=>section.id==='hot');if(hot){hot.more='hotExpand';hot.expanded=hotExpanded;hot.moreLabel=t(hotExpanded?'mobileLibrary.hotShowLess':'mobileLibrary.hotShowMore')}}
        if(discoveryError)sections.push({id:'discoveryError',layout:'message',text:t('mobileEnhancements.searchUnavailable'),more:'discoveryRetry',moreLabel:t('search.retry')});
        else if(!discovery&&p.source!=='local'&&p.source!=='navidrome')sections.push({id:'discoveryLoading',layout:'message',busy:true});
    } else if(p.mode==='suggest') {
        words('searchFor',t('search.suggestions'),[p.query]);
        words('matches',t('search.fromHistory'),p.historyMatches);
        sections.push({id:'suggestions',layout:'rows',busy:p.suggestions.status==='loading',items:p.suggestions.items.map((item,index)=>{
            const action=`suggest:${index}`;
            actions[action]=()=>{
                if(item.kind==='artist'||item.kind==='album')p.openHit(item.kind,item.hit);
                else {p.submit(item.kind==='keyword'?item.text:item.name);if(item.kind==='song')p.selectTab('song')}
            };
            return{id:action,title:item.kind==='keyword'?item.text:item.kind==='song'?item.name:item.hit.name,
                subtitle:item.kind==='song'?item.artistName:item.kind==='artist'?item.hit.description:item.kind==='album'?item.hit.artistName:undefined,
                image:absolutePageImage(item.kind==='song'?item.coverUrl:item.kind==='keyword'?undefined:item.hit.coverUrl),action};
        })});
    } else {
        if(p.source==='aggregate') {
            const pages=p.tab==='artist'?p.artists.sourcePages:p.tab==='album'?p.albums.sourcePages:p.tab==='playlist'?p.playlists.sourcePages:p.sourcePages;
            const status=searchSourceStatus(pages,p.sourceLabel,t);
            if(status)sections.push(status);
        }
        sections.push({id:'tabs',layout:'chips',items:p.tabs.map(tab=>{
            actions[`tab:${tab}`]=()=>p.selectTab(tab);
            return{id:tab,title:t(`search.tab${tab[0].toUpperCase()}${tab.slice(1)}`),action:`tab:${tab}`,selected:tab===p.tab};
        })});
        if(p.needsSetup)sections.push({id:'setup',layout:'message',text:t('search.sourceNeedsSetup')});
        else {
            if(p.tab==='overview'&&best){
                let item:PageItem;
                if(best.kind==='song'){
                    const group=groups.find(group=>group.sources.includes(best.song))!;
                    item=nativeSearchGroupItem(group,actions,callbacks,setSourceGroupKey,t);
                }else{
                    const match=best, key=`best:${match.kind}:${match.hit.providerId}:${match.hit.id}`;
                    actions[key]=()=>p.openHit(match.kind,match.hit);
                    item={id:key,title:match.hit.name,image:absolutePageImage(match.hit.coverUrl),
                        subtitle:p.sourceLabel(match.hit.providerId),action:key};
                }
                sections.push({id:'bestMatch',title:t('search.bestMatch'),layout:'rows',items:[item]});
            }
            if(p.tab==='song'||p.tab==='overview') {
                const songs=p.tab==='overview'?groups.slice(0,3):groups;
                const start=p.tab==='overview'?0:offset;
                actions.allSongs=()=>p.selectTab('song');
                sections.push({id:'songs',title:t('search.tabSong'),layout:'rows',total:songs.length,offset:start,request:'range',
                    activeKey:searchDisplayPlaybackKey(groups,activeKey),playing,pendingKey:searchDisplayPlaybackKey(groups,pendingKey),
                    busy:p.searching||p.loadingMore,more:p.error?'retry':p.tab==='overview'?(groups.length>3||p.hasMore?'allSongs':undefined):p.hasMore?'more':undefined,
                    moreLabel:t(p.error?'search.retry':p.tab==='overview'?'search.seeAll':'home.loadMore'),
                    items:songs.slice(start,start+100).map(group=>nativeSearchGroupItem(group,actions,callbacks,setSourceGroupKey,t))});
                if(!p.searching&&!p.results.length)sections.push({id:'songsEmpty',layout:'message',text:t(p.error?'search.error':'home.noResults')});
            }
            for(const kind of ['artist','album','playlist'] as const) {
                if(p.tab!==kind&&p.tab!=='overview'||!p.tabs.includes(kind))continue;
                const category=kind==='artist'?p.artists:kind==='album'?p.albums:p.playlists;
                const all=category.items as Hit[],items=p.tab==='overview'?all.slice(0,3):all,start=p.tab==='overview'?0:offset;
                actions[`all:${kind}`]=()=>p.selectTab(kind);
                actions[`explore:${kind}`]=()=>p.loadExplore(kind);
                sections.push({id:kind,title:t(`search.tab${kind[0].toUpperCase()}${kind.slice(1)}`),layout:'rows',total:items.length,offset:start,request:'range',
                    busy:category.status==='loading',
                    text:category.error?t('search.categoryFailed',{defaultValue:'这一类暂时加载失败。'}):category.status==='ready'&&!all.length?t('home.noResults'):undefined,
                    more:category.error?`explore:${kind}`:p.tab==='overview'?(all.length>3||category.hasMore?`all:${kind}`:undefined):category.hasMore?`explore:${kind}`:undefined,
                    moreLabel:t(category.error?'search.retry':p.tab==='overview'?'search.seeAll':'home.loadMore'),
                    items:items.slice(start,start+100).map((hit):PageItem=>{
                        const key=`hit:${kind}:${hit.providerId}:${hit.id}`;actions[key]=()=>p.openHit(kind,hit);
                        return{id:key,title:hit.name,image:absolutePageImage(hit.coverUrl),
                            subtitle:[('artistName'in hit?hit.artistName:'creatorName'in hit?hit.creatorName:'description'in hit?hit.description:undefined),p.sourceLabel(hit.providerId)].filter(Boolean).join(' · '),action:key};
                    })});
            }
        }
    }
    // Input, suggestions and results are updates to one editable screen. A new
    // route key disposes BasicTextField and its IME composition after the first key.
    let model:NativePageModel={key:`search:${p.source}`,title:t('search.title','搜索'),trailing:'settings',trailingLabel:t('searchSettings.title'),trailingIcon:'settings',bottomClearance:122,sections};
    const sourceGroup=groups.find(group=>group.key===sourceGroupKey);
    if(sourceGroup){
        model={key:`search:sources:${sourceGroup.key}`,title:t('search.choosePlaybackSource'),leading:'back',bottomClearance:122,
            sections:[{id:'sourceChoices',layout:'rows',items:sourceGroup.sources.map(song=>nativeSearchSongItem(song,actions,{...callbacks,
                play:song=>{setSourceGroupKey(null);p.play(song)},menu:song=>{setSourceGroupKey(null);callbacks.menu(song)}},t))},
                {id:'identityEvidence',layout:'message',text:t(sourceGroup.evidence==='metadata'?'search.metadataMatchNote':'search.catalogMatchNote')}]};
    }
    if(menu) {
        const song=menu,meta=getProviderSongMetadata(song),items:PageItem[]=[];
        const add=(id:string,title:string,callback:()=>void,disabled=false)=>{items.push({id,title,action:id,disabled});actions[id]=()=>{setMenu(null);callback()}};
        add('menuPlay',t('search.playTrack'),()=>p.play(song),isSongUnavailable(song));
        add('menuQueue',t('navidrome.addToQueue'),()=>p.enqueue(song),isSongUnavailable(song));
        meta.artists.filter(a=>song.isLocal?a.entityId:song.isNavidrome?song.navidromeData?.artistId:canResolveSongCatalogRef(song,'artist',a)).forEach((a,index)=>
            add(`menuArtist:${index}`,`${t('search.tabArtist')} · ${a.name}`,()=>p.openArtist(song,a.name,a.id,a.entityId)));
        const album=meta.album;
        if(album?.name&&(song.isLocal?album.entityId:song.isNavidrome?song.navidromeData?.albumId:canResolveSongCatalogRef(song,'album',album)))
            add('menuAlbum',`${t('search.tabAlbum')} · ${album.name}`,()=>p.openAlbum(song,album.name,album.id,album.entityId));
        model={key:`search:menu:${getPlaybackSongKey(song)}`,title:song.name,leading:'back',sections:[{id:'songActions',layout:'rows',items}],bottomClearance:122};
    }
    const dispatch=pageRowActions(actions,()=>undefined);
    return useNativePage(p.root,'search',p.active,model,dispatch);
}

import { useEffect, useState, type RefObject } from 'react';
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

// src/components/app/search/useNativeSearchPage.ts
// Presentation only: playback, source selection, discovery and pagination retain their existing owners.
type Tab = 'overview' | 'song' | ExploreKind;
type Hit = SearchArtistHit | SearchAlbumHit | SearchPlaylistHit;
type Props = {
    root: RefObject<HTMLElement | null>; active: boolean; query: string; source: SearchSource;
    mode: 'landing'|'suggest'|'results'; tab: Tab; tabs: Tab[]; sources: SearchSource[];
    results: UnifiedSong[]; searching: boolean; loadingMore: boolean; error: string|null;
    hasMore: boolean; needsSetup: boolean;
    artists: ExploreCategory<SearchArtistHit>; albums: ExploreCategory<SearchAlbumHit>; playlists: ExploreCategory<SearchPlaylistHit>;
    suggestions: { items: SearchSuggestion[]; status: string }; historyMatches: string[];
    close():void; change(text:string,composing:boolean):void; submit(text?:string):void; selectTab(tab:Tab):void;
    switchSource(source:SearchSource):void; sourceLabel(source:SearchSource):string; loadMore():void;
    loadExplore():void; openHit(kind:ExploreKind,hit:Hit):void;
    play(song:UnifiedSong):void; enqueue(song:UnifiedSong):void;
    openArtist(song:UnifiedSong,name:string,id?:MediaId,entityId?:string):void;
    openAlbum(song:UnifiedSong,name:string,id?:MediaId,entityId?:string):void;
};
const EMPTY: string[]=[];
export function useNativeSearchPage(p: Props) {
    const {t}=useTranslation();
    const [offset,setOffset]=useState(0);
    const [menu,setMenu]=useState<UnifiedSong|null>(null);
    const [discovery,setDiscovery]=useState<{suggestions:string[];hot:string[]}|null>(null);
    const [discoveryError,setDiscoveryError]=useState(false);
    const [retry,setRetry]=useState(0);
    const terms=useSearchHistoryStore(s=>s.terms[p.source]??EMPTY);
    useEffect(()=>{setOffset(0);setMenu(null)},[p.source,p.query,p.tab,p.active]);
    useEffect(()=>{
        if(!NATIVE_FIRST||!p.active||p.query.trim())return;
        let alive=true;setDiscovery(null);setDiscoveryError(false);
        if(p.source!=='local'&&p.source!=='navidrome')void loadSearchDiscovery(p.source)
            .then(value=>{if(alive)setDiscovery(value)}).catch(()=>{if(alive)setDiscoveryError(true)});
        return()=>{alive=false};
    },[p.source,p.active,p.query,retry]);
    useEffect(()=>{
        if(!menu||!p.active)return;
        const back=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setMenu(null)}};
        window.addEventListener('keydown',back,true);return()=>window.removeEventListener('keydown',back,true);
    },[menu,p.active]);
    const actions:PageActions={close:p.close,change:event=>p.change(event.text??'',event.value===1),submit:event=>p.submit(event.text),
        range:event=>setOffset(Math.max(0,Math.floor((event.value??0)/100)*100)),
        retry:()=>p.submit(),more:p.loadMore,explore:p.loadExplore,
        clearHistory:()=>useSearchHistoryStore.getState().clear(p.source),discoveryRetry:()=>setRetry(v=>v+1),back:()=>setMenu(null)};
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
        words('hot',t('mobileEnhancements.hotSearch'),discovery?.hot??[]);
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
        sections.push({id:'tabs',layout:'chips',items:p.tabs.map(tab=>{
            actions[`tab:${tab}`]=()=>p.selectTab(tab);
            return{id:tab,title:t(`search.tab${tab[0].toUpperCase()}${tab.slice(1)}`),action:`tab:${tab}`,selected:tab===p.tab};
        })});
        if(p.needsSetup)sections.push({id:'setup',layout:'message',text:t('search.sourceNeedsSetup')});
        else {
            if(p.tab==='song'||p.tab==='overview') {
                const songs=p.tab==='overview'?p.results.slice(0,3):p.results;
                const start=p.tab==='overview'?0:offset;
                actions.allSongs=()=>p.selectTab('song');
                sections.push({id:'songs',title:t('search.tabSong'),layout:'rows',total:songs.length,offset:start,request:'range',
                    busy:p.searching||p.loadingMore,more:p.error?'retry':p.tab==='overview'&&p.results.length>3?'allSongs':p.hasMore?'more':undefined,
                    moreLabel:t(p.error?'search.retry':p.tab==='overview'?'mobileLibrary.all':'home.loadMore'),
                    items:songs.slice(start,start+100).map((song,index)=>{
                        const key=getPlaybackSongKey(song),meta=getProviderSongMetadata(song);
                        return{id:key,title:song.name,subtitle:[meta.artists.map(a=>a.name).join(', '),...meta.aliases.slice(0,1)].filter(Boolean).join(' · '),image:absolutePageImage(meta.coverUrl),
                            action:`play:${start+index}:${key}`,secondary:`menu:${start+index}:${key}`,secondaryLabel:'•••',disabled:isSongUnavailable(song)};
                    })});
                if(!p.searching&&!p.results.length)sections.push({id:'songsEmpty',layout:'message',text:t(p.error?'search.error':'home.noResults')});
            }
            for(const kind of ['artist','album','playlist'] as const) {
                if(p.tab!==kind&&p.tab!=='overview'||!p.tabs.includes(kind))continue;
                const category=kind==='artist'?p.artists:kind==='album'?p.albums:p.playlists;
                const all=category.items as Hit[],items=p.tab==='overview'?all.slice(0,3):all,start=p.tab==='overview'?0:offset;
                actions[`all:${kind}`]=()=>p.selectTab(kind);
                sections.push({id:kind,title:t(`search.tab${kind[0].toUpperCase()}${kind.slice(1)}`),layout:'rows',total:items.length,offset:start,request:'range',
                    busy:category.status==='loading',more:p.tab==='overview'&&all.length>3?`all:${kind}`:category.hasMore||category.error?'explore':undefined,
                    moreLabel:t(category.error?'search.retry':p.tab==='overview'?'mobileLibrary.all':'home.loadMore'),
                    items:items.slice(start,start+100).map((hit,index):PageItem=>({id:String(hit.id),title:hit.name,image:absolutePageImage(hit.coverUrl),
                        subtitle:'artistName'in hit?hit.artistName:'creatorName'in hit?hit.creatorName:'description'in hit?hit.description:undefined,
                        action:`hit:${kind}:${start+index}:${hit.id}`}))});
            }
        }
    }
    let model:NativePageModel={key:`search:${p.source}:${p.mode}:${p.tab}:${p.mode==='results'?p.query:'input'}`,title:t('search.title','搜索'),leading:'close',bottomClearance:30,sections};
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
        model={key:`search:menu:${getPlaybackSongKey(song)}`,title:song.name,leading:'back',sections:[{id:'songActions',layout:'rows',items}],bottomClearance:30};
    }
    const dispatch=pageRowActions(actions,key=>{
        const match=/^(play|menu):(\d+):(.+)$/.exec(key);
        if(match){const song=p.results[Number(match[2])];if(!song||getPlaybackSongKey(song)!==match[3])return;
            return()=>{if(match[1]==='menu')setMenu(song);else if(!isSongUnavailable(song))p.play(song)};}
        const hit=/^hit:(artist|album|playlist):(\d+):(.+)$/.exec(key);
        if(hit){const kind=hit[1] as ExploreKind,items=kind==='artist'?p.artists.items:kind==='album'?p.albums.items:p.playlists.items;
            const item=items[Number(hit[2])];if(item&&String(item.id)===hit[3])return()=>p.openHit(kind,item);}
    });
    return useNativePage(p.root,'search',p.active,model,dispatch);
}

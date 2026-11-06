import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeHomeProps } from './NativeHomeOverview';
import type { PageSection } from '../../../../types/nativePages';
import type { LocalLibraryGroup, LocalSong, SongResult } from '../../../../types';
import { LOCAL_HOME_SECTIONS, type LocalHomeSectionKey } from '../../../core/model/localHomeModel';
import { useLibraryHomeLocal } from '../../../core/bindings/useLibraryHomeLocal';
import { useLibraryHomeActions } from '../../../core/bindings/useLibraryHomeActions';
import { buildLocalQueue, LIST_ROW_COVER_SIZE } from '../../../../services/playbackAdapters';
import { getSongArtistLabel, getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { useLibraryTrackPlayback } from '../../../../hooks/useLibraryTrackPlayback';
import { useNativePage } from '../../../../hooks/useNativePage';
import { useMobileLibraryStore } from '../../../../stores/useMobileLibraryStore';
import { absolutePageImage } from '../../../../services/nativePages';
import { getLocalCoverAssetUrl } from '../../../../services/localCoverAssetUrl';
import { LOCAL_MUSIC_UPDATED_EVENT } from '../../../../services/localMusicService';
import {
    LOCAL_PLAY_HISTORY_UPDATED_EVENT,
    aggregateLocalAlbumPlays,
    localDailySeed,
    pickDailyLocalSongs,
    pickLeastRecentlyPlayed,
    pickRandomLocalSongs,
    resolveLocalPlayHistory,
    type LocalAlbumPlayStat,
    type ResolvedLocalPlay,
} from '../../../../services/localPlayHistory';
import { openAddToPlaylistForSong } from '../../../../stores/useAddToPlaylistStore';
import { getFavoriteLocalPlaylist, setLocalSongIdFavorite } from '../../../../services/localPlaylistService';
import { useLocalLibraryHydrated } from '../../../../services/localLibraryHydration';
import { setStatusMessage } from '../../../../stores/useStatusMessageStore';
import LocalSongActionSheet from './LocalSongActionSheet';

// src/library/suites/mobile/native/NativeLocalHomeOverview.tsx
/**
 * 本地音乐推荐首页（按设计图实现的数据驱动版）。
 *
 * 结构与在线推荐页一致：标题 → 三张横滑卡 → 四个快捷入口 → 最近播放 → 常听专辑 → 为你发现，
 * 后面接现有迷你播放器与底部导航。所有数字、封面、歌曲都来自真实本地曲库与本地播放历史：
 * 没有数据就收缩或禁用对应区块，绝不编造。
 *
 * 播放走 useLibraryTrackPlayback（与在线首页同一入口）：切换音源不打断播放，
 * 只有用户点本地歌曲或卡片上的「立即播放」才把内容换成本地队列。
 */
// 本地歌的封面：内嵌/导入封面优先，用户显式选了在线封面时才用在线图。
const localSongCover=(song:LocalSong):string|undefined=>(
    song.useOnlineCover&&song.onlineMetadata?.coverUrl
        ?song.onlineMetadata.coverUrl
        :getLocalCoverAssetUrl(song.localCoverAssetId,512)||song.onlineMetadata?.coverUrl||undefined
);

const getSongAlbumNameFromLocal=(song:LocalSong):string=>(
    song.importedMetadata?.albumName||song.onlineMetadata?.album?.name||''
);

export default function NativeLocalHomeOverview({root,props,sources,onReady,onSources}:NativeHomeProps) {
    const {t}=useTranslation();
    const play=useLibraryTrackPlayback(props.onPlaySong,props.onTogglePlayback);
    const {snapshot,importBusy}=useLibraryHomeActions(props.homeResources.actions);
    const local=useLibraryHomeLocal({localSongs:props.localSongs,localPlaylists:props.localPlaylists,catalog:props.localLibraryCatalog,activeRow:props.localMusicState.activeRow});
    // 启动专项（录屏 68710）：重建后 loadLocalSongs 的 Dexie 读取完成前 localSongs=[]
    // 不是真值。此时不发首页包，原生继续显示 NativeShellCache 缓存页（上一会话完整
    // 首页），避免「专辑 0 张 / 还没有本地音乐」空态闪现；真正空曲库的用户在水合
    // 完成后照样拿到空态页。暖恢复时水合早已完成，这里恒为 true，零影响。
    const libraryHydrated=useLocalLibraryHydrated();
    const [history,setHistory]=useState<ResolvedLocalPlay[]>([]);
    const [albums,setAlbums]=useState<LocalAlbumPlayStat[]>([]);
    const [menu,setMenu]=useState<{song:SongResult;queue:SongResult[]}|null>(null);
    // 菜单里「收藏/取消收藏」的当前状态：打开菜单时按「我喜欢」歌单现读一次。
    const [menuLiked,setMenuLiked]=useState<boolean|null>(null);
    const [discoverSeed,setDiscoverSeed]=useState(0);
    const dailySeed=useMemo(()=>localDailySeed(),[]);

    // 播放历史在 IndexedDB：挂载、播放记录变化、曲库变化时重读（记录只存 id+计数，读起来很轻）。
    useEffect(()=>{
        let alive=true;
    const load=async()=>{
        const plays=await resolveLocalPlayHistory(props.localSongs);
        if(!alive)return;
        setHistory(plays);
        setAlbums(aggregateLocalAlbumPlays(plays));
    };
        void load();
        window.addEventListener(LOCAL_PLAY_HISTORY_UPDATED_EVENT,load);
        window.addEventListener(LOCAL_MUSIC_UPDATED_EVENT,load);
        return()=>{
            alive=false;
            window.removeEventListener(LOCAL_PLAY_HISTORY_UPDATED_EVENT,load);
            window.removeEventListener(LOCAL_MUSIC_UPDATED_EVENT,load);
        };
    },[props.localSongs]);

    const mostPlayedSongs=useMemo(()=>(
        [...history].sort((a,b)=>b.playCount-a.playCount||b.lastPlayedAt-a.lastPlayedAt).slice(0,30).map(entry=>entry.song)
    ),[history]);
    const dailySongs=useMemo(()=>pickDailyLocalSongs(props.localSongs,dailySeed,30),[props.localSongs,dailySeed]);
    const recentAddedSongs=useMemo(()=>(
        [...props.localSongs].sort((a,b)=>(b.addedAt||0)-(a.addedAt||0)).slice(0,30)
    ),[props.localSongs]);
    const recentSongs=useMemo(()=>history.slice(0,12).map(entry=>entry.song),[history]);
    // 「换一批」同时转动两张发现卡：随机卡重抽，久未播放卡按圈数轮转。
    const againSongs=useMemo(()=>{
        const base=pickLeastRecentlyPlayed(history,24).map(entry=>entry.song);
        if(base.length<=8||discoverSeed===0)return base;
        const offset=(discoverSeed*6)%base.length;
        return [...base.slice(offset),...base.slice(0,offset)];
    },[history,discoverSeed]);
    const randomSongs=useMemo(()=>pickRandomLocalSongs(props.localSongs,20),[props.localSongs,discoverSeed]);

    // 列表本身都 ≤30 首，统一转成播放队列（带封面）；曲库或列表不变时 memo 命中。
    const catalog=props.localLibraryCatalog;
    const mostUnified=useMemo(()=>buildLocalQueue(mostPlayedSongs,undefined,catalog,LIST_ROW_COVER_SIZE),[mostPlayedSongs,catalog]);
    const dailyUnified=useMemo(()=>buildLocalQueue(dailySongs,undefined,catalog,LIST_ROW_COVER_SIZE),[dailySongs,catalog]);
    const recentAddedUnified=useMemo(()=>buildLocalQueue(recentAddedSongs,undefined,catalog,LIST_ROW_COVER_SIZE),[recentAddedSongs,catalog]);
    const recentUnified=useMemo(()=>buildLocalQueue(recentSongs,undefined,catalog,LIST_ROW_COVER_SIZE),[recentSongs,catalog]);
    const againUnified=useMemo(()=>buildLocalQueue(againSongs,undefined,catalog,LIST_ROW_COVER_SIZE),[againSongs,catalog]);
    const randomUnified=useMemo(()=>buildLocalQueue(randomSongs,undefined,catalog,LIST_ROW_COVER_SIZE),[randomSongs,catalog]);

    const openLibrarySection=useCallback((key:LocalHomeSectionKey)=>{
        const row=LOCAL_HOME_SECTIONS.find(section=>section.key===key)?.row ?? 0;
        props.setLocalMusicState(previous=>({...previous,activeRow:row}));
        useMobileLibraryStore.getState().setPage('library');
    },[props]);
    const openGroup=useCallback((group:LocalLibraryGroup)=>{
        props.homeResources.actions.openLocalGroup(group,props.onOpenGridView);
    },[props]);
    const openAlbumOfSong=useCallback((song:SongResult)=>{
        const localId=(song as unknown as {localRef?:{songId?:string}}).localRef?.songId;
        const localSong=props.localSongs.find(candidate=>candidate.id===localId);
        const albumName=localSong?getSongAlbumNameFromLocal(localSong):'';
        const songs=albumName?props.localSongs.filter(candidate=>getSongAlbumNameFromLocal(candidate)===albumName):[];
        const fallback:LocalSong[]=localSong?[localSong]:[];
        openGroup({
            id:`album-${albumName||song.id}`,type:'album',name:albumName||song.name,
            songs:songs.length>0?songs:fallback,
            coverUrl:undefined,trackCount:songs.length||1,description:getSongArtistLabel(song),
        });
    },[openGroup,props.localSongs]);

    const actions:Record<string,(event:{text?:string;value?:number})=>void>={sources:onSources};
    const sections:PageSection[]=[];
    const hasLibrary=props.localSongs.length>0;
    const favoriteGroup=useMemo(()=>local.sections.find(section=>section.key==='playlists')?.groups.find(group=>group.isVirtual===true),[local.sections]);
    const playlistCount=props.localPlaylists.length;
    const albumCount=local.sections.find(section=>section.key==='albums')?.groups.length ?? 0;
    const artistCount=local.sections.find(section=>section.key==='artists')?.groups.length ?? 0;
    const favoriteCount=favoriteGroup?.songs.length ?? 0;

    // ---- 三张横滑推荐卡（顺序固定：常听精选 / 本地30首 / 最近添加；没数据的卡收缩掉） ----
    // 背景为设计提供的 WebP 成品图（随 APK 打包，离线可用）；圆角与裁切由容器控制。
    const heroCandidates=[
        {
            id:'local-most-played',title:t('localHome.mostPlayed'),subtitle:t('localHome.mostPlayedHint'),
            image:absolutePageImage('/assets/mobile-home/local_favorites.webp'),
            secondaryLabel:t('mobileLibrary.playNow'),action:'local:hero-most',
            disabled:mostUnified.length===0,
        },
        {
            id:'local-daily-30',title:t('localHome.daily30'),subtitle:t('localHome.dailyHint'),
            image:absolutePageImage('/assets/mobile-home/local_daily30.webp'),
            secondaryLabel:t('mobileLibrary.playNow'),action:'local:hero-daily',
            disabled:dailyUnified.length===0,
        },
        {
            id:'local-recent-added',title:t('localHome.recentAdded'),subtitle:t('localHome.recentAddedHint'),
            image:absolutePageImage('/assets/mobile-home/local_recent.webp'),
            secondaryLabel:t('mobileLibrary.playNow'),action:'local:hero-recent-added',
            disabled:recentAddedUnified.length===0,
        },
    ];
    const heroItems=heroCandidates.filter(item=>!item.disabled);
    if(heroItems.length>0){
        actions['local:hero-most']=()=>{if(mostUnified.length)play(mostUnified[0],mostUnified)};
        actions['local:hero-daily']=()=>{if(dailyUnified.length)play(dailyUnified[0],dailyUnified)};
        actions['local:hero-recent-added']=()=>{if(recentAddedUnified.length)play(recentAddedUnified[0],recentAddedUnified)};
        sections.push({id:'local-hero',layout:'hero',items:heroItems});
    }

    // ---- 四个快捷入口（我喜欢 / 本地歌单 / 专辑 / 歌手），数量全部真实 ----
    actions['local:open-favorites']=()=>{if(favoriteGroup)openGroup(favoriteGroup)};
    actions['local:open-playlists']=()=>openLibrarySection('playlists');
    actions['local:open-albums']=()=>openLibrarySection('albums');
    actions['local:open-artists']=()=>openLibrarySection('artists');
    sections.push({id:'local-quick',layout:'quickLinks',items:[
        {id:'quick-fav',title:t('localHome.favorites'),subtitle:t('localHome.countSongs',{count:favoriteCount}),image:'heart',action:'local:open-favorites',disabled:favoriteCount===0},
        {id:'quick-playlists',title:t('localHome.playlists'),subtitle:t('localHome.countLists',{count:playlistCount}),image:'music2',action:'local:open-playlists'},
        {id:'quick-albums',title:t('localHome.albums'),subtitle:t('localHome.countAlbums',{count:albumCount}),image:'disc-2',action:'local:open-albums',disabled:albumCount===0},
        {id:'quick-artists',title:t('localHome.artists'),subtitle:t('localHome.countArtists',{count:artistCount}),image:'user-round',action:'local:open-artists',disabled:artistCount===0},
    ]});

    // ---- 最近播放（仅本地播放历史；「全部」打开完整历史集合） ----
    if(recentUnified.length>0){
        recentUnified.forEach((song,index)=>{
            actions[`local:recent:${index}`]=()=>play(song,recentUnified);
            actions[`local:recent-menu:${index}`]=()=>{
                setMenu({song,queue:recentUnified});
                const songId=(song as unknown as {localRef?:{songId?:string}}).localRef?.songId;
                if(!songId){setMenuLiked(null);return;}
                void getFavoriteLocalPlaylist().then(favorite=>{
                    setMenuLiked(favorite.songIds.includes(songId));
                });
            };
        });
        // 菜单里的收藏切换：与播放器心形同一套「我喜欢」数据。
        actions['local:recent-like']=()=>{
            // 保留入口（原生事件总线可能直呼），实际逻辑在菜单组件的 onToggleLike 里。
            const current=menu;
            if(!current)return;
            const songId=(current.song as unknown as {localRef?:{songId?:string}}).localRef?.songId;
            if(!songId)return;
            void (async()=>{
                const next=!(menuLiked===true);
                try{
                    await setLocalSongIdFavorite(songId,next);
                    window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
                    setMenuLiked(next);
                    setStatusMessage({type:'success',text:t(next?'status.liked':'status.unliked')});
                }catch(error){
                    console.warn('[NativeLocalHomeOverview] Failed to toggle favorite:',error);
                    setStatusMessage({type:'error',text:t('status.likeFailed')});
                }
            })();
        };
        actions['local:recent-add-to-playlist']=()=>{
            const current=menu;
            if(!current)return;
            setMenu(null);
            openAddToPlaylistForSong(current.song);
        };        actions['local:recent-all']=()=>openGroup({
            id:'local-history-recent',type:'folder',name:t('localHome.recentPlayed'),songs:recentSongs,
            coverUrl:undefined,trackCount:recentSongs.length,description:t('localHome.recentPlayed'),isVirtual:true,
        });
        sections.push({id:'recent',title:t('localHome.recentPlayed'),layout:'cards',more:'local:recent-all',moreLabel:t('localHome.all'),
            items:recentUnified.map((song,index)=>({
                id:`local-recent:${song.id}`,title:song.name,subtitle:getSongArtistLabel(song),
                image:absolutePageImage(getSongCoverUrl(song)),action:`local:recent:${index}`,secondary:`local:recent-menu:${index}`,secondaryLabel:'⋮',
            }))});
    }

    // ---- 常听专辑（按播放记录聚合；没有记录就不显示） ----
    if(albums.length>0){
        const rail=albums.slice(0,12);
        rail.forEach((stat,index)=>{
            actions[`local:album:${index}`]=()=>openGroup({
                id:`album-${stat.albumKey}`,type:'album',name:stat.albumName,songs:stat.songs,
                coverUrl:undefined,trackCount:stat.songs.length,description:stat.artistName,
            });
        });
        actions['local:albums-all']=()=>openLibrarySection('albums');
        sections.push({id:'localAlbums',title:t('localHome.topAlbums'),layout:'cards',more:'local:albums-all',moreLabel:t('localHome.all'),
            items:rail.map((stat,index)=>{
                // 专辑封面取专辑里第一首带封面的歌；整张都没封面时交给 PageArtwork 的缺省图。
                const withCover=stat.songs.find(song=>Boolean(localSongCover(song)))??stat.songs[0];
                return{
                    id:`local-album:${stat.albumKey}`,title:stat.albumName,subtitle:stat.artistName,
                    image:absolutePageImage(withCover?localSongCover(withCover):undefined),
                    action:`local:album:${index}`,
                };
            })});
    }

    // ---- 为你发现（久未播放 + 随机探索；曲目不足时不硬凑） ----
    const discoverItems:PageSection['items']=[];
    if(againUnified.length>0){
        discoverItems.push({id:'discover-again',title:t('localHome.discoverAgain'),subtitle:t('localHome.discoverAgainHint'),action:'local:play-again'});
        actions['local:play-again']=()=>{if(againUnified.length)play(againUnified[0],againUnified)};
    }
    if(randomUnified.length>0){
        discoverItems.push({id:'discover-random',title:t('localHome.discoverRandom'),subtitle:t('localHome.discoverRandomHint'),action:'local:play-random'});
        actions['local:play-random']=()=>{if(randomUnified.length)play(randomUnified[0],randomUnified)};
    }
    if(discoverItems.length>0){
        actions['local:discover-refresh']=()=>setDiscoverSeed(value=>value+1);
        sections.push({id:'local-discover',title:t('localHome.discover'),layout:'discoverCards',more:'local:discover-refresh',moreLabel:`${t('localHome.refresh')} ⟳`,items:discoverItems});
    }

    // ---- 空曲库：保留页面风格，给真实可点的扫描 / 导入 ----
    if(!hasLibrary){
        sections.push({id:'local-empty',layout:'message',text:importBusy?t('options.scanning'):t('localHome.emptyTitle')});
        sections.push({id:'local-empty-actions',layout:'rows',items:[
            {id:'empty-scan',title:t('localHome.scanDevice'),subtitle:t('localHome.scanDeviceHint'),action:'local:scan',disabled:!snapshot.deviceScanAvailable||importBusy},
            {id:'empty-import',title:t('localHome.importFolder'),subtitle:t('localHome.importFolderHint'),action:'local:import',disabled:importBusy},
        ]});
        actions['local:scan']=()=>{void props.homeResources.actions.scanDeviceMusic()};
        actions['local:import']=()=>{void props.homeResources.actions.importFolder()};
    }

    // key 契约（NativePageRetention.pageBelongsToRoute）：route=home 且非资料库页签时，
    // 页面 key 必须以 "home:" 开头，否则整包会被原生按 route-target-mismatch 拒收，
    // 表现就是「首页没有完成加载」。本地首页同样挂在 home 路由下，所以前缀必须是 home:。
    // key 必须只随页面身份变化，不能掺入数据修订号（2026-11-06 换一批专项）：原生
    // AnimatedContent 以 key 为 contentKey、滚动状态挂在 SaveableStateProvider(key) 下，
    // key 一变就是整页转场 + 滚动回顶 —— 「换一批」（discoverSeed）和听完一首歌
    // （historyRevision）都会被误当成换页。数据变化靠 sections 内容差异触发原地更新。
    const model={key:`home:local:${props.localSongs.length}`,title:t('mobileLibrary.recommend'),
        subtitle:t('mobileLibrary.localDiscoverSubtitle'),trailing:'sources',trailingLabel:t('mobileLibrary.localMusicSource'),
        trailingIcon:'smartphone',background:'home' as const,bottomClearance:152,topPadding:32,sections};
    useNativePage(root,'home',props.isInteractive,libraryHydrated||props.localSongs.length>0?model:null,actions,onReady);
    return menu?<LocalSongActionSheet menu={menu} liked={menuLiked}
        onClose={()=>setMenu(null)}
        onPlay={()=>{if(!menu)return;play(menu.song,menu.queue);setMenu(null)}}
        onAddToPlaylist={()=>{if(!menu)return;setMenu(null);openAddToPlaylistForSong(menu.song)}}
        onToggleLike={()=>{const current=menu;if(!current)return;
            void (async()=>{
                const next=!(menuLiked===true);
                try{
                    const songId=(current.song as unknown as {localRef?:{songId?:string}}).localRef?.songId;
                    if(!songId)return;
                    await setLocalSongIdFavorite(songId,next);
                    window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
                    setMenuLiked(next);
                    setStatusMessage({type:'success',text:t(next?'status.liked':'status.unliked')});
                }catch(error){
                    console.warn('[NativeLocalHomeOverview] Failed to toggle favorite:',error);
                    setStatusMessage({type:'error',text:t('status.likeFailed')});
                }
            })();}}
        onViewAlbum={()=>{if(!menu)return;setMenu(null);openAlbumOfSong(menu.song)}}/>:null;
}

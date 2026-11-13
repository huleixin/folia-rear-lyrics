import { AnimatePresence } from 'framer-motion';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryHomeLocal } from '../../../core/bindings/useLibraryHomeLocal';
import { buildMusicFolders, folderAt, songsInFolder } from '../../../core/model/localFolderTree';
import type { LibraryHomeCard } from '../../../core/contracts/homeModel';
import type { PageActions, PageSection } from '../../../../types/nativePages';
import type { NativeHomeProps } from './NativeHomeOverview';
import NativeDirectoryPage from './NativeDirectoryPage';
import MobileSheet from '../MobileSheet';
import { MobileLocalTools } from '../MobileHomeSources';
import { hasBlockingWindow } from '../../../../utils/keyboardTargets';
import { buildLocalQueue, LIST_ROW_COVER_SIZE } from '../../../../services/playbackAdapters';
import { getSongArtistLabel, getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { catalogBadgePageFields } from '../../../../utils/catalogAudioLabels';
import { absolutePageImage } from '../../../../services/nativePages';
import { useLibraryTrackPlayback } from '../../../../hooks/useLibraryTrackPlayback';
import { useLocalTrackSortStore } from '../../../core/state/useLocalTrackSortStore';
import { sortLocalFolderSongs } from '../../../../utils/localSongSorting';
import type { LocalSongFolderSortField } from '../../../../utils/localSongSorting';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { PlayerState, type LocalSong, type SongResult } from '../../../../types';
import { getFavoriteLocalPlaylist, setLocalSongIdFavorite } from '../../../../services/localPlaylistService';
import { openAddToPlaylistForSong } from '../../../../stores/useAddToPlaylistStore';
import { LOCAL_MUSIC_UPDATED_EVENT } from '../../../../services/localMusicService';
import { setStatusMessage } from '../../../../stores/useStatusMessageStore';
import LocalSongActionSheet, { type LocalSongMenu } from './LocalSongActionSheet';

// 时长（毫秒）→ h:mm:ss / mm:ss；未知或非法值返回 '--:--' 占位，不写死。
const formatPageDuration=(ms:number|undefined):string=>{
    if(!Number.isFinite(ms)||ms===undefined||ms<=0)return '--:--';
    const total=Math.floor(ms/1000);
    const seconds=String(total%60).padStart(2,'0');
    const minutes=Math.floor(total/60)%60;
    const hours=Math.floor(total/3600);
    return hours>0?`${hours}:${String(minutes).padStart(2,'0')}:${seconds}`:`${minutes}:${seconds}`;
};

// src/library/suites/mobile/native/NativeLocalLibrary.tsx
export default function NativeLocalLibrary(args:NativeHomeProps) {
    const {props}=args;const {t}=useTranslation();
    const local=useLibraryHomeLocal({localSongs:props.localSongs,localPlaylists:props.localPlaylists,catalog:props.localLibraryCatalog,activeRow:props.localMusicState.activeRow});
    const [tools,setTools]=useState(false),[path,setPath]=useState('');
    const tree=useMemo(()=>buildMusicFolders(props.localSongs),[props.localSongs]);
    const folder=useMemo(()=>folderAt(tree,path),[tree,path]);
    const [query,setQuery]=useState(''),[songOffset,setSongOffset]=useState(0);
    const isSongs=local.activeSection.key==='songs';
    // 排序沿用全局那份选择（与「打开的集合页」同一个 store），两处顺序不会打架。
    const sortField=useLocalTrackSortStore(state=>state.field);
    const sortDirection=useLocalTrackSortStore(state=>state.direction);
    const setSortField=useLocalTrackSortStore(state=>state.setField);
    const sortSongs=useMemo(()=>(
        isSongs?sortLocalFolderSongs(props.localSongs,sortField,sortDirection):folder.songs
    ),[folder.songs,isSongs,props.localSongs,sortDirection,sortField]);
    const tracks=useMemo(()=>buildLocalQueue(sortSongs,undefined,props.localLibraryCatalog,LIST_ROW_COVER_SIZE),[sortSongs,props.localLibraryCatalog]);
    const play=useLibraryTrackPlayback(props.onPlaySong,props.onTogglePlayback);
    // 当前播放标识与轻量均衡器动画：直接读全局播放状态，不建第二套状态管理。
    const currentSongId=(usePlaybackStore(s=>s.currentSong) as unknown as {localRef?:{songId?:string}}|null)?.localRef?.songId;
    const playing=usePlaybackStore(s=>s.playerState===PlayerState.PLAYING);
    const [menu,setMenu]=useState<LocalSongMenu|null>(null),[menuLiked,setMenuLiked]=useState<boolean|null>(null);
    const filtered=useMemo(()=>tracks.filter(song=>`${song.name} ${getSongArtistLabel(song)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),[tracks,query]);
    useEffect(()=>{setSongOffset(0);setQuery('')},[path,local.activeSection.key]);
    useEffect(()=>{
        const back=(event:KeyboardEvent)=>{
            if(event.key!=='Escape'||!props.isInteractive||local.activeSection.key!=='folders'||!folder.path||hasBlockingWindow())return;
            event.preventDefault();event.stopImmediatePropagation();setPath(folder.path.split('/').slice(0,-1).join(''));
        };
        window.addEventListener('keydown',back,true);return()=>window.removeEventListener('keydown',back,true);
    },[folder.path,local.activeSection.key,props.isInteractive]);
    const actions:PageActions={tools:()=>setTools(true)};
    const tailSections:PageSection[]=[];
    const sections:PageSection[]=[{id:'local-sections',layout:'chips',items:local.sections.map(section=>{
        actions[`local:${section.key}`]=()=>props.setLocalMusicState(previous=>({...previous,activeRow:section.row}));
        return{id:section.key,title:section.label,selected:section.key===local.activeSection.key,action:`local:${section.key}`};
    })}];
    if(isSongs){
        const fields:LocalSongFolderSortField[]=['fileName','fileLastModified','albumTrack'];
        const labels:Record<LocalSongFolderSortField,string>={
            fileName:t('localMusic.sortByFileName'),
            fileLastModified:t('localMusic.sortByModifiedDate'),
            albumTrack:t('localMusic.sortByAlbumTrack'),
        };
        sections.push({id:'song-sort',title:t('localMusic.sortSongs'),layout:'chips',items:fields.map(field=>{
            actions[`song-sort:${field}`]=()=>setSortField(field);
            return{id:field,title:labels[field],selected:sortField===field,action:`song-sort:${field}`};
        })});
    }
    let cards=local.activeSection.cards;
    let open=(card:LibraryHomeCard,index:number)=>props.homeResources.actions.openLocalGroup(local.activeSection.groups[index],props.onOpenGridView);
    if(local.activeSection.key==='folders'){
        const children=Array.from(folder.children.values());
        cards=children.map(child=>({id:child.path,name:child.name,trackCount:child.count,description:child.path}));
        open=card=>setPath(String(card.id));
        actions.parent=()=>setPath(folder.path.split('/').slice(0,-1).join(''));
        actions.folderSongs=()=>props.homeResources.actions.openLocalGroup({id:`folder:${folder.path}`,name:folder.name||'全部本地音乐',type:'folder',songs:songsInFolder(folder)},props.onOpenGridView);
        actions.directSongs=()=>props.homeResources.actions.openLocalGroup({id:`folder-direct:${folder.path}`,name:folder.name||'未分类',type:'folder',songs:folder.songs},props.onOpenGridView);
        sections.push({id:'path',title:folder.path||'文件夹',layout:'chips',items:[
            {id:'parent',title:'上级文件夹',action:'parent',disabled:!folder.path},
            {id:'all',title:`查看全部 ${folder.count}`,action:'folderSongs',disabled:!folder.count},
            ...(folder.songs.length?[{id:'direct',title:`当前文件夹的歌曲 · ${folder.songs.length}`,action:'directSongs'}]:[]),
        ]});
    }
    // 「歌曲」与「文件夹」都要在页面上直接列歌；其余分区只出集合卡片。
    if(isSongs||local.activeSection.key==='folders'){
        actions.songRange=e=>setSongOffset(Math.max(0,Math.floor((e.value??0)/100)*100));
        const openSongMenu=(song:SongResult)=>{
            setMenu({song,queue:tracks});
            const songId=(song as unknown as {localRef?:{songId?:string}}).localRef?.songId;
            if(!songId){setMenuLiked(null);return;}
            void getFavoriteLocalPlaylist().then(favorite=>{setMenuLiked(favorite.songIds.includes(songId));});
        };
        filtered.forEach(song=>{
            actions[`local-song:${song.id}`]=()=>play(song,tracks);
            // 三点菜单：复用首页同款歌曲操作菜单；行点击仍是播放，事件分发互不影响。
            actions[`local-song-menu:${song.id}`]=()=>openSongMenu(song);
        });
        const title=isSongs?`${local.activeSection.label} · ${filtered.length}`:`当前文件夹的歌曲 · ${filtered.length}`;
        tailSections.push({id:'local-songs',title,layout:'rows',key:`${path}:${query}:${sortField}:${sortDirection}`,
            playing,
            total:filtered.length,offset:songOffset,request:'songRange',items:filtered.slice(songOffset,songOffset+100).map(song=>{
                const artist=getSongArtistLabel(song);
                // 本地歌的音质标注（无损/HQ，同集合页推导规则）；没有档位就不带字段。
                return{
                    ...catalogBadgePageFields(song,t,true),
                    id:`local-song:${song.id}`,title:song.name,
                    subtitle:artist,
                    // 时长（mm:ss / h:mm:ss）与三点菜单；当前播放行 selected=青绿标题+封面叠加标识。
                    duration:formatPageDuration((song as unknown as {durationMs?:number;duration?:number}).durationMs??(song as unknown as {duration?:number}).duration),
                    image:absolutePageImage(getSongCoverUrl(song)),action:`local-song:${song.id}`,
                    secondary:`local-song-menu:${song.id}`,secondaryLabel:'⋯',
                    selected:currentSongId===(song as unknown as {localRef?:{songId?:string}}).localRef?.songId,
                };
            })});
    }
    return <>
        <NativeDirectoryPage {...args} key={`${local.activeSection.key}:${path}`} route={`local:${local.activeSection.key}:${path}`} cards={cards}
            onOpen={open} sections={sections} tailSections={tailSections} onFilter={value=>{setQuery(value);setSongOffset(0)}} extraActions={actions} emptyMessage={local.activeSection.emptyMessage}
            headingTrailing="tools" headingTrailingLabel={t('mobileLibrary.more')}/>
        <AnimatePresence>{tools&&<MobileSheet title={t('mobileLibrary.importMusic')} onClose={()=>setTools(false)}><MobileLocalTools homeResources={props.homeResources}/></MobileSheet>}</AnimatePresence>
        {menu&&<LocalSongActionSheet menu={menu} liked={menuLiked}
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
                        console.warn('[NativeLocalLibrary] Failed to toggle favorite:',error);
                        setStatusMessage({type:'error',text:t('status.likeFailed')});
                    }
                })();}}
            onViewAlbum={()=>{const current=menu;if(!current)return;setMenu(null);
                const songId=(current.song as unknown as {localRef?:{songId?:string}}).localRef?.songId;
                const localSong=songId?props.localSongs.find(candidate=>candidate.id===songId):undefined;
                const albumName=localSong?(localSong.importedMetadata?.albumName||localSong.onlineMetadata?.album?.name||''):'';
                const songs=albumName?props.localSongs.filter(candidate=>(candidate.importedMetadata?.albumName||candidate.onlineMetadata?.album?.name||'')===albumName):[];
                const fallback:LocalSong[]=localSong?[localSong]:[];
                props.homeResources.actions.openLocalGroup({
                    id:`album-${albumName||current.song.id}`,type:'album',name:albumName||current.song.name,
                    songs:songs.length>0?songs:fallback,
                    coverUrl:undefined,trackCount:songs.length||1,
                    description:localSong?(localSong.importedMetadata?.artistNames??[]).join(', '):'',
                },props.onOpenGridView);}}/>}
    </>;
}

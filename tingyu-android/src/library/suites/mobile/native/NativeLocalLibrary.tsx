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
import { normalizeCatalogAudioSpecs } from '../../../../types/catalogAudioSpecs';
import { absolutePageImage } from '../../../../services/nativePages';
import { useLibraryTrackPlayback } from '../../../../hooks/useLibraryTrackPlayback';
import { useLocalTrackSortStore } from '../../../core/state/useLocalTrackSortStore';
import { sortLocalFolderSongs } from '../../../../utils/localSongSorting';
import type { LocalSongFolderSortField } from '../../../../utils/localSongSorting';

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
    })},{id:'tools',layout:'message',more:'tools',moreLabel:t('mobileLibrary.importMusic')}];
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
        filtered.forEach(song=>{actions[`local-song:${song.id}`]=()=>play(song,tracks)});
        const title=isSongs?`${local.activeSection.label} · ${filtered.length}`:`当前文件夹的歌曲 · ${filtered.length}`;
        tailSections.push({id:'local-songs',title,layout:'rows',key:`${path}:${query}:${sortField}:${sortDirection}`,
            total:filtered.length,offset:songOffset,request:'songRange',items:filtered.slice(songOffset,songOffset+100).map(song=>{
                const artist=getSongArtistLabel(song);
                // 本地歌的音质标注（无损/HQ，同集合页推导规则）；没有档位就不带字段。
                const specs=(normalizeCatalogAudioSpecs(song.catalogAudioSpecs)||[]).slice(0,1);
                const specsField=specs.length?{audioSpecs:specs,audioSpecsLabel:t('localMusic.audioSpecsLabel',{specs:specs.map(spec=>t(`catalogAudioSpecs.${spec}`)).join(' / ')})}:{};
                return{
                    ...specsField,
                    id:`local-song:${song.id}`,title:song.name,
                    subtitle:artist,
                    image:absolutePageImage(getSongCoverUrl(song)),action:`local-song:${song.id}`,
                };
            })});
    }
    return <>
        <NativeDirectoryPage {...args} key={`${local.activeSection.key}:${path}`} route={`local:${local.activeSection.key}:${path}`} cards={cards}
            onOpen={open} sections={sections} tailSections={tailSections} onFilter={value=>{setQuery(value);setSongOffset(0)}} extraActions={actions} emptyMessage={local.activeSection.emptyMessage}/>
        {tools&&<MobileSheet title={t('mobileLibrary.importMusic')} onClose={()=>setTools(false)}><MobileLocalTools homeResources={props.homeResources}/></MobileSheet>}
    </>;
}

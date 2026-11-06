import React from 'react';
import { useTranslation } from 'react-i18next';
import MobileSheet from '../MobileSheet';
import type { SongResult } from '../../../../types';

// src/library/suites/mobile/native/LocalSongActionSheet.tsx
// 本地歌曲操作菜单：首页「最近播放」的 ⋮ 与资料库歌曲行的 ⋯ 共用同一套
// MobileSheet 与动作（播放 / 加入歌单 / 收藏切换 / 查看专辑），不建第二套菜单。
// liked=null 表示收藏态还没预读完成（按钮暂不出现），true/false 为当前状态。
export type LocalSongMenu={song:SongResult;queue:SongResult[]};
export default function LocalSongActionSheet({menu,liked,onClose,onPlay,onAddToPlaylist,onToggleLike,onViewAlbum}:{
    menu:LocalSongMenu;liked:boolean|null;onClose:()=>void;onPlay:()=>void;onAddToPlaylist:()=>void;onToggleLike:()=>void;onViewAlbum:()=>void;
}){
    const {t}=useTranslation();
    return <MobileSheet title={menu.song.name} onClose={onClose}>
        <button className="ml-sheet-action" onClick={onPlay}>{t('mobileLibrary.play')}</button>
        <button className="ml-sheet-action" onClick={onAddToPlaylist}>{t('localMusic.addToPlaylist')}</button>
        {liked!==null&&<button className="ml-sheet-action" onClick={onToggleLike}>{t(liked?'mobileLibrary.unlikeSong':'mobileLibrary.likeSong')}</button>}
        <button className="ml-sheet-action" onClick={onViewAlbum}>{t('localHome.viewAlbum')}</button>
    </MobileSheet>;
}

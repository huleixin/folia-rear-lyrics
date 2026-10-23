import React from 'react';
import { Heart, SkipBack, SkipForward, Play, Pause, Repeat, Repeat1, Disc3, UserRound, Palette, Settings2, Copy } from 'lucide-react';
import type { UnifiedPanelProps } from '../UnifiedPanel';
import { PlayerState, type UnifiedSong } from '../../types';
import { getSongArtistLabel } from '../../services/onlineMusic/songMetadata';
import { isLocalPlaybackSong, resolveNavidromePlaybackCarrier } from '../../utils/appPlaybackGuards';
import { canResolveSongCatalogRef } from '../../services/onlineMusic/catalogRefs';
import { openSettings } from '../../stores/useSettingsModalStore';
import { useMobileToolsText } from './useMobileToolsText';
import { resolveLikeAvailability } from '../../utils/playerLikeAvailability';

// src/components/mobile-player/MobileSongTools.tsx
export default function MobileSongTools({playback:p,library:lib,account}:UnifiedPanelProps) {
    const text=useMobileToolsText(),song=p.currentSong!;
    const local=isLocalPlaybackSong(song), navi=resolveNavidromePlaybackCarrier(song);
    const like=resolveLikeAvailability(song,!!p.playbackControlsDisabled,'isStage' in song && song.isStage===true);
    const run=(fn:()=>void)=>{p.onToggle();fn();};
    const album=()=>{if(local)lib.onOpenCurrentLocalAlbum();else if(navi)lib.onOpenCurrentNavidromeAlbum();else p.onAlbumSelect(song,song.album);};
    const artist=()=>{if(local)lib.onOpenCurrentLocalArtist();else if(navi)lib.onOpenCurrentNavidromeArtist();else if(song.artists?.[0])p.onSelectArtist(song,song.artists[0]);};
    return <div className="ty-song-tools">
        <div className="ty-song-meta">{song.album?.coverUrl && <img src={song.album.coverUrl} alt=""/>}<div><strong>{song.name}</strong><span>{getSongArtistLabel(song)}</span><small>{song.album?.name}</small></div></div>
        <section className="ty-card"><div className="ty-transport">
            <button className="ty-icon" aria-label={text.loop} aria-pressed={p.loopMode!=='off'} disabled={p.isFmMode||p.playbackControlsDisabled} onClick={p.onToggleLoop}>{p.loopMode==='one'?<Repeat1/>:<Repeat/>}</button>
            <button className="ty-icon" aria-label={text.previous} disabled={p.playbackControlsDisabled} onClick={p.onPrevTrack}><SkipBack/></button>
            <button className="ty-icon ty-play" aria-label={text.play} disabled={p.playbackControlsDisabled} onClick={p.onTogglePlay}>{p.playerState===PlayerState.PLAYING?<Pause/>:<Play/>}</button>
            <button className="ty-icon" aria-label={text.next} disabled={p.playbackControlsDisabled} onClick={p.onNextTrack}><SkipForward/></button>
            <button className="ty-icon" aria-label={text.like} aria-pressed={p.isLiked} disabled={like.disabled} onClick={p.onLike}><Heart fill={p.isLiked?'currentColor':'none'}/></button>
        </div><label className="ty-volume">{text.volume}<input aria-label={text.volume} type="range" min="0" max="1" step="0.01" value={p.volume} onChange={e=>p.onVolumeChange(Number(e.target.value))}/></label>
        <label className="ty-select">{text.gain}<select value={p.replayGainMode} onChange={e=>p.onChangeReplayGainMode(e.target.value as typeof p.replayGainMode)}><option value="off">{text.off}</option><option value="track">{text.track}</option><option value="album">{text.albumGain}</option></select></label></section>
        <section className="ty-card ty-actions">
            <button className="ty-action" disabled={!local&&!navi&&!canResolveSongCatalogRef(song as UnifiedSong,'album',song.album)} onClick={()=>run(album)}><Disc3 size={20}/>{text.album}</button>
            <button className="ty-action" disabled={!local&&!navi&&!song.artists?.[0]} onClick={()=>run(artist)}><UserRound size={20}/>{text.artist}</button>
            <button className="ty-action" onClick={()=>{void navigator.clipboard?.writeText(`${song.name} - ${getSongArtistLabel(song)}`).then(lib.onCopySongInfoSuccess).catch(()=>{});}}><Copy size={20}/>{text.copied}</button>
        </section><section className="ty-card ty-actions">
            <button className="ty-action" onClick={()=>run(()=>openSettings('options','visualizer','visualizer'))}><Palette size={20}/>{text.appearance}</button>
            <button className="ty-action" onClick={()=>run(()=>openSettings('options','playback'))}><Settings2 size={20}/>{text.settings}</button>
        </section>
    </div>;
}

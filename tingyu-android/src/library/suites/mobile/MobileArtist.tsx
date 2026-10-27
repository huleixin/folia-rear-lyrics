import React, { useCallback, useState, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, MoreVertical, Play, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SongResult } from '../../../types';
import type { LibraryArtistSurfaceProps } from '../../core/contracts/suite';
import { useArtistResourceState } from '../../core/bindings/useArtistResourceState';
import { useArtistView } from '../../core/bindings/useArtistView';
import { useCollectionView } from '../../core/bindings/useCollectionView';
import { useCommittedQuery } from '../../core/bindings/useCommittedQuery';
import { useLibraryArtistSurfaceRegistration } from '../../core/bindings/useLibraryArtistSurfaceRegistration';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { resolveTrackAlbumLink, resolveTrackArtistLinks } from '../../core/model/trackLinks';
import { canResolveSongCatalogRef } from '../../../services/onlineMusic/catalogRefs';
import { useLibraryTrackPlayback } from '../../../hooks/useLibraryTrackPlayback';
import MobileArtwork from './MobileArtwork';
import MobileDirectory from './MobileDirectory';
import MobileTrackList from './MobileTrackList';
import MobileSheet from './MobileSheet';
import { NATIVE_FIRST } from '../../../services/nativePages';
import { useNativeArtistPage } from './native/useNativeArtistPage';
import './mobileLibrary.css';

// src/library/suites/mobile/MobileArtist.tsx
function MobileArtist(props: LibraryArtistSurfaceProps) {
    const { t } = useTranslation();
    const { snapshot } = useArtistResourceState(props.resource);
    const model = useArtistView({ ...props, snapshot, setStatus: setStatusMessage });
    useLibraryArtistSurfaceRegistration({
        isInteractive: props.isInteractive,
        getState: model.surfaceState,
        run: model.runSurface,
    });
    const reducedMotion = useReducedMotion();
    const [tab, setTab] = useState<'songs' | 'albums'>('songs');
    const [menu, setMenu] = useState<SongResult | 'artist' | null>(null);
    const closeMenu = useCallback(() => setMenu(null), []);
    const songMenu = useCallback((song: SongResult) => setMenu(song), []);
    const tracks = useCollectionView({ tracks: model.topSongs, committedQuery: useCommittedQuery(model.query) });
    const selectTrack = useLibraryTrackPlayback(props.playback.playTrack, props.playback.togglePlayback);
    const playSong = useCallback(
        (song: SongResult) => selectTrack(song, model.playableTopSongs),
        [selectTrack, model.playableTopSongs]
    );
    const albumLink = menu && menu !== 'artist' ? resolveTrackAlbumLink(menu, canResolveSongCatalogRef) : null;
    const artistLinks = menu && menu !== 'artist' ? resolveTrackArtistLinks(menu, canResolveSongCatalogRef) : [];
    const root=useRef<HTMLElement>(null);
    const native=useNativeArtistPage(root,props,model,tracks,tab,setTab,playSong,setMenu);
    return (
        <motion.section
            ref={root}
            initial={NATIVE_FIRST?false:{ opacity: 0, x: reducedMotion ? 0 : 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reducedMotion ? 0 : 24, pointerEvents: 'none' }}
            transition={{ duration: NATIVE_FIRST||reducedMotion ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="mobile-library ml-page ml-collection"
            inert={!props.isInteractive}
            data-testid="mobile-artist"
        >
            {!native&&<><div className="ml-collection-top">
                <button className="ml-icon" aria-label={t('mobileLibrary.back')} onClick={props.onBack}>
                    <ArrowLeft />
                </button>
                <span className="ml-spacer" />
                <button
                    className="ml-icon"
                    aria-label={t('mobileLibrary.artistActions')}
                    onClick={() => setMenu('artist')}
                >
                    <MoreVertical />
                </button>
            </div>
            <header className="ml-collection-header">
                <h1>{snapshot?.detail?.name || props.collection.name}</h1>
                <div className="ml-collection-intro">
                    <MobileArtwork src={snapshot?.detail?.coverUrl || props.collection.coverUrl} priority />
                    <p>{snapshot?.detail?.description || props.collection.description}</p>
                </div>
                <div className="ml-collection-actions">
                    <button
                        className="ml-play-all"
                        disabled={!model.playableTopSongs.length}
                        onClick={model.actions.playScope}
                    >
                        <span className="ml-play">
                            <Play size={18} fill="currentColor" />
                        </span>
                        {t('mobileLibrary.playAll')}
                    </button>
                </div>
            </header>
            <div className="ml-tabs">
                <button aria-pressed={tab === 'songs'} onClick={() => setTab('songs')}>
                    {t('mobileLibrary.topSongs')}
                </button>
                <button aria-pressed={tab === 'albums'} onClick={() => setTab('albums')}>
                    {t('mobileLibrary.albums', { count: model.albums.length })}
                </button>
            </div>
            <label className="ml-filter">
                <Search size={17} />
                <input
                    placeholder={t('mobileLibrary.filterArtist')}
                    aria-label={t('mobileLibrary.filterArtist')}
                    value={model.query}
                    onChange={(event) => model.setQuery(event.target.value)}
                />
            </label>
            {snapshot?.status === 'error' && (
                <div className="ml-error" role="alert">
                    {t('mobileLibrary.loadFailed')}
                    <button onClick={model.actions.reload}>{t('mobileLibrary.retry')}</button>
                </div>
            )}
            {snapshot?.albumSync.state === 'interrupted' && (
                <button className="ml-text-button" onClick={model.actions.retryAlbums}>
                    {t('mobileLibrary.resumeSync')}
                </button>
            )}
            {tab === 'songs' ? (
                <MobileTrackList
                    sessionKey={model.sessionKey}
                    query={model.query}
                    view={tracks}
                    onPlay={playSong}
                    onMenu={songMenu}
                />
            ) : (
                <MobileDirectory
                    cards={model.shownAlbums}
                    onOpen={(_, index) => model.actions.openAlbum(model.shownAlbums[index])}
                />
            )}
            {snapshot?.status === 'ready' &&
                (tab === 'songs'
                    ? !(tracks.matchIndexes?.length ?? tracks.displayTracks.length)
                    : !model.shownAlbums.length) && (
                    <p className="ml-empty">
                        {t(model.query ? 'mobileLibrary.noResults' : 'mobileLibrary.emptyCollection')}
                    </p>
                )}
            {(snapshot?.status === 'idle' || snapshot?.status === 'loading') && (
                <p className="ml-empty" role="status">
                    {t('mobileLibrary.loading')}
                </p>
            )}
            </>}
            {menu && (
                <MobileSheet
                    title={menu === 'artist' ? t('mobileLibrary.artistActions') : menu.name}
                    onClose={closeMenu}
                >
                    <button
                        className="ml-sheet-action"
                        onClick={() => {
                            menu === 'artist' ? model.actions.enqueueScope() : model.actions.enqueueSong(menu);
                            closeMenu();
                        }}
                    >
                        {t('mobileLibrary.enqueue')}
                    </button>
                    {menu === 'artist' ? (
                        <>
                            {model.capabilities.reload.supported && (
                                <button
                                    className="ml-sheet-action"
                                    disabled={!model.capabilities.reload.enabled}
                                    onClick={() => {
                                        model.actions.reload();
                                        closeMenu();
                                    }}
                                >
                                    {t('mobileLibrary.refresh')}
                                </button>
                            )}
                            {model.capabilities['edit-entity'].supported && (
                                <button
                                    className="ml-sheet-action"
                                    disabled={!model.capabilities['edit-entity'].enabled}
                                    onClick={() => {
                                        model.actions.editEntity();
                                        closeMenu();
                                    }}
                                >
                                    {t('mobileLibrary.editInfo')}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {albumLink && (
                                <button
                                    className="ml-sheet-action"
                                    onClick={() => {
                                        props.onOpenAlbum(albumLink.targetId, { ...albumLink.album }, menu);
                                        closeMenu();
                                    }}
                                >
                                    {t('mobileLibrary.openAlbum')}
                                </button>
                            )}
                            {artistLinks
                                .filter((link) => link.targetId != null)
                                .map((link) => (
                                    <button
                                        className="ml-sheet-action"
                                        key={link.targetId}
                                        onClick={() => {
                                            props.onOpenArtist(link.targetId!, { ...link.artist }, menu);
                                            closeMenu();
                                        }}
                                    >
                                        {t('mobileLibrary.openArtist')} · {link.artist.name}
                                    </button>
                                ))}
                        </>
                    )}
                </MobileSheet>
            )}
        </motion.section>
    );
}
export default React.memo(MobileArtist);

import React, { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, MoreVertical, Play, Heart, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';
import type { SongResult } from '../../../types';
import { useMobileCollection } from './useMobileCollection';
import { useMobileCollectionAutoplay } from './useMobileCollectionAutoplay';
import MobileArtwork from './MobileArtwork';
import MobileTrackList from './MobileTrackList';
import MobileCollectionMenu, { type MobileMenuTarget } from './MobileCollectionMenu';
import MobilePlaylistHeader from './MobilePlaylistHeader';
import MobilePlaylistBackdrop from './MobilePlaylistBackdrop';
import { useNativeCollectionPage } from './native/useNativeCollectionPage';
import { NATIVE_FIRST } from '../../../services/nativePages';
import './mobileLibrary.css';
import './mobilePlaylistDetail.css';

// src/library/suites/mobile/MobileCollection.tsx
function MobileCollection(props: LibraryCollectionSurfaceProps) {
    const { t } = useTranslation();
    const model = useMobileCollection(props);
    useMobileCollectionAutoplay(
        model.sessionKey,
        model.snapshot?.status,
        model.view.contextTracks.length,
        model.actions.playScope
    );
    const [target, setTarget] = useState<MobileMenuTarget | null>(null);
    const [filterOpen, setFilterOpen] = useState(!!model.query);
    const [notice, setNotice] = useState('');
    const closeMenu = useCallback(() => setTarget(null), []);
    const openSongMenu = useCallback(
        (song: SongResult, index: number) => {
            const entryKey = model.view.entryKeyAt(index);
            if (entryKey) setTarget({ song, index, entryKey });
        },
        [model.view.entryKeyAt]
    );
    const reducedMotion = useReducedMotion();
    const detail = model.snapshot?.detail;
    const isPlaylist = props.collection.type === 'playlist';
    const name = model.mutations.renamedTo ?? detail?.name ?? props.collection.name;
    const count = isPlaylist
        ? detail?.trackCount ?? props.collection.trackCount ?? model.snapshot?.tracks.length ?? 0
        : model.snapshot?.tracks.length || props.collection.trackCount || 0;
    const toggleSubscribe = async () => {
        setNotice('');
        try {
            const result = await props.mutations?.toggleSubscribe();
            if (result && !result.ok) setNotice(result.message || t('mobileLibrary.actionFailed'));
        } catch {
            setNotice(t('mobileLibrary.actionFailed'));
        }
    };
    const root=React.useRef<HTMLElement>(null);
    const native=useNativeCollectionPage(root,props,model,name,count,openSongMenu,()=>setTarget('collection'),()=>{void toggleSubscribe()});
    return (
        <motion.section
            ref={root}
            initial={NATIVE_FIRST?false:{ opacity: 0, x: reducedMotion ? 0 : 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reducedMotion ? 0 : 24, pointerEvents: 'none' }}
            transition={{ duration: reducedMotion||NATIVE_FIRST ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className={`mobile-library ml-page ml-collection${isPlaylist ? ' ml-playlist-detail' : ''}`}
            inert={!props.isInteractive}
            data-testid="mobile-collection"
        >
            {!native&&<>
            {isPlaylist && <MobilePlaylistBackdrop cover={detail?.coverUrl || props.collection.coverUrl} />}
            <div className="ml-collection-top">
                <button className="ml-icon" aria-label={t('mobileLibrary.back')} onClick={props.onBack}>
                    <ArrowLeft size={23} />
                </button>
                <span className="ml-spacer" />
                <button
                    className="ml-icon"
                    aria-label={t('mobileLibrary.filter')}
                    aria-expanded={filterOpen}
                    onClick={() => setFilterOpen((value) => !value)}
                >
                    <Search size={21} />
                </button>
                <button
                    className="ml-icon"
                    aria-label={t('mobileLibrary.playlistActions')}
                    onClick={() => setTarget('collection')}
                >
                    <MoreVertical size={23} />
                </button>
            </div>
            <MobileTrackList
                sessionKey={model.sessionKey}
                query={model.query}
                view={model.view}
                onPlay={model.playTrack}
                onMenu={openSongMenu}
                revealHeader={filterOpen}
                onClearQuery={() => { model.setQuery(''); setFilterOpen(false); }}
                showArtwork={isPlaylist}
                footer={isPlaylist ? <div className="ml-playlist-tail" /> : undefined}
                header={
                    <>
                        {isPlaylist ? <MobilePlaylistHeader
                            collection={props.collection} detail={detail} name={name} count={count} actions={model.actions}
                            canSubscribe={model.mutations.capabilities.subscribe.supported}
                            subscribeEnabled={model.mutations.capabilities.subscribe.enabled}
                            subscribed={!!model.mutations.subscribed} onSubscribe={() => void toggleSubscribe()}
                        /> : <header className="ml-collection-header">
                            <h1>{name}</h1>
                            <p className="ml-subtitle">{t('mobileLibrary.trackCount', { count })}</p>
                            <div className="ml-collection-intro">
                                <MobileArtwork src={detail?.coverUrl || props.collection.coverUrl} priority />
                                <p>{detail?.description || props.collection.description || name}</p>
                            </div>
                            <div className="ml-collection-actions">
                                <button
                                    className="ml-play-all"
                                    disabled={!model.actions.capabilities.scope.enabled}
                                    onClick={model.actions.playScope}
                                >
                                    <span className="ml-play">
                                        <Play size={18} fill="currentColor" />
                                    </span>
                                    {t('mobileLibrary.playAll')}
                                </button>
                                <span className="ml-spacer" />
                                {model.mutations.capabilities.subscribe.supported && (
                                    <button
                                        className="ml-save"
                                        disabled={!model.mutations.capabilities.subscribe.enabled}
                                        aria-pressed={!!model.mutations.subscribed}
                                        onClick={() => void toggleSubscribe()}
                                    >
                                        <Heart size={23} fill={model.mutations.subscribed ? 'currentColor' : 'none'} />
                                        {t(model.mutations.subscribed ? 'mobileLibrary.saved' : 'mobileLibrary.save')}
                                    </button>
                                )}
                            </div>
                        </header>}
                        {filterOpen && (
                            <div className="ml-filter">
                                <Search size={17} />
                                <input
                                    autoFocus
                                    placeholder={t('mobileLibrary.filter')}
                                    aria-label={t('mobileLibrary.filter')}
                                    value={model.query}
                                    onChange={(event) => model.setQuery(event.target.value)}
                                />
                                <button
                                    className="ml-icon"
                                    aria-label={t('mobileLibrary.close')}
                                    onClick={() => {
                                        model.setQuery('');
                                        setFilterOpen(false);
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        )}
                        {(model.snapshot?.error || notice) && (
                            <div className="ml-error" role="alert">
                                {notice ||
                                    (model.snapshot?.error?.kind === 'generic'
                                        ? model.snapshot.error.message
                                        : t('mobileLibrary.loadFailed'))}
                                <button onClick={model.actions.reload}>{t('mobileLibrary.retry')}</button>
                            </div>
                        )}
                        {model.snapshot?.sync.status === 'interrupted' && (
                            <button className="ml-text-button" onClick={model.actions.resumeSync}>
                                {t('mobileLibrary.resumeSync')}
                            </button>
                        )}
                        {!model.view.displayTracks.length && (
                            <p className="ml-empty" role="status">
                                {t(
                                    !model.snapshot ||
                                        model.snapshot.status === 'idle' ||
                                        model.snapshot.status === 'loading'
                                        ? 'mobileLibrary.loading'
                                        : 'mobileLibrary.emptyCollection'
                                )}
                            </p>
                        )}
                        {model.view.matchIndexes?.length === 0 && (
                            <p className="ml-empty">{t('mobileLibrary.noResults')}</p>
                        )}
                    </>
                }
            />
            </>}
            {target && <MobileCollectionMenu props={props} model={model} target={target} onClose={closeMenu} />}
        </motion.section>
    );
}
export default React.memo(MobileCollection);

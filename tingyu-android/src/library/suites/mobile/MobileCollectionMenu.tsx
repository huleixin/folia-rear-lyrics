import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';
import type { SongResult } from '../../../types';
import type { LibraryMutationResult } from '../../core/contracts/mutations';
import { resolveTrackAlbumLink, resolveTrackArtistLinks } from '../../core/model/trackLinks';
import { canResolveSongCatalogRef } from '../../../services/onlineMusic/catalogRefs';
import type { useMobileCollection } from './useMobileCollection';
import MobileSheet from './MobileSheet';
import MobileCollectionSourceActions from './MobileCollectionSourceActions';

// src/library/suites/mobile/MobileCollectionMenu.tsx
export type MobileMenuTarget = { song: SongResult; index: number; entryKey: string } | 'collection';
type Model = ReturnType<typeof useMobileCollection>;
export default function MobileCollectionMenu({
    props,
    model,
    target,
    onClose,
}: {
    props: LibraryCollectionSurfaceProps;
    model: Model;
    target: MobileMenuTarget;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState<{
        label: string;
        initial: string;
        confirm: boolean;
        run: (value: string) => Promise<LibraryMutationResult>;
    } | null>(null);
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const mutations = props.mutations;
    const caps = model.mutations.capabilities;
    const run = async (action: () => Promise<LibraryMutationResult>, done?: () => void) => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const result = await action();
            if (result.ok) {
                onClose();
                done?.();
            } else setError(result.message || t('mobileLibrary.actionFailed'));
        } catch {
            setError(t('mobileLibrary.actionFailed'));
        } finally {
            setBusy(false);
        }
    };
    const ask = (
        label: string,
        initial: string,
        confirm: boolean,
        action: (value: string) => Promise<LibraryMutationResult>
    ) => {
        setPrompt({ label, initial, confirm, run: action });
        setValue(initial);
    };
    const button = (label: string, action: () => void, disabled = false) => (
        <button className="ml-sheet-action" disabled={busy || disabled} onClick={action}>
            {label}
        </button>
    );
    const tracks = target === 'collection' ? model.view.contextTracks : [target.song];
    const album = target !== 'collection' ? resolveTrackAlbumLink(target.song, canResolveSongCatalogRef) : null;
    const artists = target !== 'collection' ? resolveTrackArtistLinks(target.song, canResolveSongCatalogRef) : [];
    return (
        <MobileSheet
            title={prompt?.label || (target === 'collection' ? t('mobileLibrary.playlistActions') : target.song.name)}
            onClose={onClose}
        >
            {prompt ? (
                <form
                    className="ml-prompt"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void run(() => prompt.run(value));
                    }}
                >
                    {prompt.confirm ? (
                        <p>{t('mobileLibrary.confirmRemoval')}</p>
                    ) : (
                        <input
                            autoFocus
                            aria-label={prompt.label}
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                        />
                    )}
                    <button className="ml-solid" disabled={busy || (!prompt.confirm && !value.trim())}>
                        {t('mobileLibrary.confirm')}
                    </button>
                    <button type="button" className="ml-text-button" disabled={busy} onClick={() => setPrompt(null)}>
                        {t('mobileLibrary.cancel')}
                    </button>
                </form>
            ) : (
                <>
                    {button(t('mobileLibrary.enqueue'), () => {
                        target === 'collection'
                            ? model.actions.enqueueScope()
                            : model.actions.enqueueTrack(target.song);
                        onClose();
                    })}
                    {target === 'collection' && (
                        <MobileCollectionSourceActions
                            props={props}
                            model={model}
                            commands={{ button, ask, run, busy, onClose }}
                        />
                    )}
                    {target !== 'collection' && (
                        <>
                            {album &&
                                button(t('mobileLibrary.openAlbum'), () => {
                                    props.onOpenAlbum(album.targetId, { ...album.album }, target.song);
                                    onClose();
                                })}
                            {artists
                                .filter((link) => link.targetId != null)
                                .map((link) => (
                                    <React.Fragment key={link.targetId}>
                                        {button(`${t('mobileLibrary.openArtist')} · ${link.artist.name}`, () => {
                                            props.onOpenArtist(link.targetId!, { ...link.artist }, target.song);
                                            onClose();
                                        })}
                                    </React.Fragment>
                                ))}
                            {caps.matchSong.supported &&
                                button(
                                    t('mobileLibrary.matchSong'),
                                    () => void run(() => mutations!.matchSong(target.song)),
                                    !caps.matchSong.enabled
                                )}
                            {caps.removeEntry.supported &&
                                button(
                                    t('mobileLibrary.removeTrack'),
                                    () =>
                                        ask(t('mobileLibrary.removeTrack'), '', true, () =>
                                            mutations!.removeEntry({ track: target.song, entryKey: target.entryKey })
                                        ),
                                    !caps.removeEntry.enabled ||
                                        model.mutations.pendingEntryKeys.includes(target.entryKey)
                                )}
                        </>
                    )}
                    {caps.addToPlaylist.supported && (
                        <div className="ml-prompt">
                            <label>
                                {t('mobileLibrary.addToPlaylist')}
                                <select
                                    defaultValue=""
                                    disabled={busy || !caps.addToPlaylist.enabled}
                                    onChange={(event) => {
                                        if (event.target.value)
                                            void run(() => mutations!.addToPlaylist(event.target.value, tracks));
                                    }}
                                >
                                    <option value="" disabled>
                                        {t('mobileLibrary.choosePlaylist')}
                                    </option>
                                    {model.mutations.availablePlaylists.map((playlist) => (
                                        <option key={playlist.id} value={playlist.id}>
                                            {playlist.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    )}
                    {caps.createPlaylist.supported &&
                        button(
                            t('mobileLibrary.createPlaylist'),
                            () =>
                                ask(t('mobileLibrary.createPlaylist'), '', false, (name) =>
                                    mutations!.createPlaylist(name, tracks)
                                ),
                            !caps.createPlaylist.enabled
                        )}
                </>
            )}
            {error && (
                <p className="ml-error" role="alert">
                    {error}
                </p>
            )}
        </MobileSheet>
    );
}

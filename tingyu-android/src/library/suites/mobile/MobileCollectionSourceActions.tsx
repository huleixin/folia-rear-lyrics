import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';
import type { LibraryMutationResult } from '../../core/contracts/mutations';
import type { useMobileCollection } from './useMobileCollection';

// src/library/suites/mobile/MobileCollectionSourceActions.tsx
export type MobileMenuCommands = {
    button: (label: string, action: () => void, disabled?: boolean) => React.ReactNode;
    ask: (
        label: string,
        initial: string,
        confirm: boolean,
        action: (value: string) => Promise<LibraryMutationResult>
    ) => void;
    run: (action: () => Promise<LibraryMutationResult>, done?: () => void) => Promise<void>;
    busy: boolean;
    onClose: () => void;
};
export default function MobileCollectionSourceActions({
    props,
    model,
    commands,
}: {
    props: LibraryCollectionSurfaceProps;
    model: ReturnType<typeof useMobileCollection>;
    commands: MobileMenuCommands;
}) {
    const { t } = useTranslation();
    const { button, ask, run, busy, onClose } = commands;
    const caps = model.mutations.capabilities;
    const mutations = props.mutations;
    return (
        <>
            {model.actions.capabilities.reload.supported &&
                button(
                    t('mobileLibrary.refresh'),
                    () => {
                        model.actions.reload();
                        onClose();
                    },
                    !model.actions.capabilities.reload.enabled
                )}
            {model.supportsSort && (
                <div className="ml-prompt">
                    <label>
                        {t('mobileLibrary.sort')}
                        <select
                            value={model.field}
                            onChange={(event) => model.sortActions.setField(event.target.value as typeof model.field)}
                        >
                            <option value="fileName">{t('mobileLibrary.sortName')}</option>
                            <option value="fileLastModified">{t('mobileLibrary.sortDate')}</option>
                            <option value="albumTrack">{t('mobileLibrary.sortAlbum')}</option>
                        </select>
                    </label>
                    <button
                        className="ml-sheet-action"
                        onClick={() => model.sortActions.setDirection(model.direction === 'asc' ? 'desc' : 'asc')}
                    >
                        {t(model.direction === 'asc' ? 'mobileLibrary.ascending' : 'mobileLibrary.descending')}
                    </button>
                </div>
            )}
            {caps.rename.supported &&
                button(
                    t('mobileLibrary.rename'),
                    () =>
                        ask(
                            t('mobileLibrary.rename'),
                            model.mutations.renamedTo ?? props.collection.name,
                            false,
                            (name) => mutations!.rename(name)
                        ),
                    !caps.rename.enabled
                )}
            {caps.deleteCollection.supported &&
                button(
                    t('mobileLibrary.deletePlaylist'),
                    () =>
                        ask(t('mobileLibrary.deletePlaylist'), '', true, async () => {
                            const result = await mutations!.deleteCollection();
                            if (result.ok) props.onDone();
                            return result;
                        }),
                    !caps.deleteCollection.enabled
                )}
            {caps.resyncFolder.supported &&
                button(
                    t('mobileLibrary.rescan'),
                    () => void run(() => mutations!.resyncFolder()),
                    !caps.resyncFolder.enabled
                )}
            {caps.resyncAllFolders.supported &&
                button(
                    t('mobileLibrary.rescanAll'),
                    () => void run(() => mutations!.resyncAllFolders()),
                    !caps.resyncAllFolders.enabled
                )}
            {caps.exportPlaylist.supported &&
                button(
                    t('mobileLibrary.exportPlaylist'),
                    () => void run(() => mutations!.exportPlaylist()),
                    !caps.exportPlaylist.enabled
                )}
            {caps.editEntity.supported &&
                button(
                    t('mobileLibrary.editInfo'),
                    () => void run(() => mutations!.editEntity()),
                    !caps.editEntity.enabled
                )}
            {caps.organizeSongInfo.supported &&
                button(
                    t('mobileLibrary.organizeInfo'),
                    () => void run(() => mutations!.organizeSongInfo()),
                    !caps.organizeSongInfo.enabled
                )}
            {caps.dailyDate.supported && (
                <label className="ml-prompt">
                    {t('mobileLibrary.dailyDate')}
                    <select
                        value={model.mutations.dailyDate}
                        disabled={busy || !caps.dailyDate.enabled}
                        onChange={(event) => void run(() => mutations!.setDailyDate(event.target.value))}
                    >
                        <option value="">{t('mobileLibrary.today')}</option>
                        {model.mutations.dailyHistoryDates.filter(Boolean).map((date) => (
                            <option key={date} value={date}>
                                {date}
                            </option>
                        ))}
                    </select>
                </label>
            )}
        </>
    );
}

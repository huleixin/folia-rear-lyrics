import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import type { LibraryHomeSources } from '../../core/bindings/useLibraryHomeSources';
import { useLibraryHomeOnline } from '../../core/bindings/useLibraryHomeOnline';
import MobileDirectory from './MobileDirectory';

// src/library/suites/mobile/MobileLibraryOnline.tsx
export default function MobileLibraryOnline({ props, sources }: {
    props: LibraryHomeSurfaceProps; sources: LibraryHomeSources;
}) {
    const { t } = useTranslation();
    const online = useLibraryHomeOnline(props.homeResources, sources);
    const available = sources.tab === 'playlist' ? sources.online.canUsePlaylists
        : sources.tab === 'albums' ? sources.online.canUseAlbums : sources.online.canUseRadio;
    return <MobileDirectory
        fillBehindFooter
        cards={online.items}
        alwaysShowFilter
        heading={sources.tab === 'playlist' ? t('mobileLibrary.myPlaylists') : online.title}
        enableSort={sources.tab === 'playlist'}
        restoreKey={`library:${sources.online.providerId}:${sources.tab}`}
        emptyMessage={online.isLoading || !available ? online.emptyMessage : t('mobileLibrary.directoryEmpty')}
        onOpen={card => props.homeResources.actions.openOnlineCard(card, sources.online.providerId, props.onOpenGridView)}
    />;
}

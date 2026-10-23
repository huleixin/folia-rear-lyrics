import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import { useLibraryHomeLocal } from '../../core/bindings/useLibraryHomeLocal';
import { useLibraryHomeNavidrome } from '../../core/bindings/useLibraryHomeNavidrome';
import { resolveNavidromeCollectionType } from '../../core/model/navidromeHomeModel';
import MobileDirectory from './MobileDirectory';
import { MobileLocalTools } from './MobileHomeSources';

// src/library/suites/mobile/MobileSourceDirectories.tsx
export function LocalDirectory(props: LibraryHomeSurfaceProps) {
    const local = useLibraryHomeLocal({
        localSongs: props.localSongs,
        localPlaylists: props.localPlaylists,
        catalog: props.localLibraryCatalog,
        activeRow: props.localMusicState.activeRow,
    });
    return (
        <>
            <div className="ml-tabs">
                {local.sections.map((section) => (
                    <button
                        key={section.key}
                        aria-pressed={section.key === local.activeSection.key}
                        onClick={() =>
                            props.setLocalMusicState((previous) => ({ ...previous, activeRow: section.row }))
                        }
                    >
                        {section.label}
                    </button>
                ))}
            </div>
            <MobileLocalTools homeResources={props.homeResources} />
            <MobileDirectory
                fillBehindFooter
                key={local.activeSection.key}
                alwaysShowFilter
                emptyMessage={local.activeSection.emptyMessage}
                restoreKey={`library:local:${local.activeSection.key}`}
                cards={local.activeSection.cards}
                onOpen={(_, index) =>
                    props.homeResources.actions.openLocalGroup(
                        local.activeSection.groups[index],
                        props.onOpenGridView
                    )
                }
            />
        </>
    );
}
export function NavidromeDirectory(props: LibraryHomeSurfaceProps) {
    const model = useLibraryHomeNavidrome(props.homeResources.navidromeOverview);
    const { t } = useTranslation();
    return (
        <>
            <div className="ml-tabs">
                {model.sections.map((section) => (
                    <button
                        key={section.key}
                        aria-pressed={section.active}
                        onClick={() => model.setSection(section.key)}
                    >
                        {section.label}
                    </button>
                ))}
            </div>
            <button className="ml-text-button" disabled={model.isLoading} onClick={() => void model.refresh()}>
                {t('mobileLibrary.refresh')}
            </button>
            <MobileDirectory
                fillBehindFooter
                key={model.section}
                alwaysShowFilter
                emptyMessage={model.emptyMessage}
                restoreKey={`library:navidrome:${model.section}`}
                cards={model.items}
                onOpen={(card) =>
                    props.homeResources.actions.openNavidromeCard(
                        card,
                        resolveNavidromeCollectionType(model.section, card.id),
                        props.onOpenGridView
                    )
                }
            />
        </>
    );
}

import React from 'react';
import type { LibrarySuiteManifest } from '../../core/contracts/suite';
import { mobileCollectionLoader } from './mobileCollectionPreload';

// src/library/suites/mobile/entry.ts
// A separate browsing shell; playback, account dialogs and the lyrics stage stay with their existing owners.
const mobile: LibrarySuiteManifest = {
    id: 'mobile',
    labelKey: 'mobileLibrary.name',
    surfaces: {
        account: {
            component: React.lazy(() => import('./account/GridAccountSurface')),
            actions: ['account-login', 'account-login-method', 'account-switch-confirm', 'account-select', 'account-logout', 'account-login-diagnostics', 'account-backend-restart'],
        },
        artist: {
            component: React.lazy(() => import('./MobileArtist')),
            actions: [
                'play',
                'enqueue',
                'play-scope',
                'enqueue-scope',
                'filter',
                'reload',
                'resume-sync',
                'edit-entity',
                'open-album',
                'open-artist',
            ],
        },
        home: {
            component: React.lazy(() => import('./MobileHome')),
            actions: ['home-import-folder', 'home-refresh-folders', 'home-import-playlist', 'home-refresh-navidrome'],
        },
        collection: {
            component: mobileCollectionLoader.Component,
            actions: [
                'play',
                'enqueue',
                'play-scope',
                'enqueue-scope',
                'filter',
                'sort',
                'reload',
                'resume-sync',
                'subscribe',
                'remove-entry',
                'rename',
                'delete-collection',
                'resync-folder',
                'resync-all-folders',
                'export-playlist',
                'edit-entity',
                'organize-song-info',
                'match-song',
                'daily-date',
                'add-to-playlist',
                'create-playlist',
                'open-album',
                'open-artist',
            ],
        },
    },
    stage: React.lazy(() => import('./MobileLibraryStage')),
};
export default mobile;

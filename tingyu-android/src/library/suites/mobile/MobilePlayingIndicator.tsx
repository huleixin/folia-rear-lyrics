import React from 'react';
import { useTranslation } from 'react-i18next';

// src/library/suites/mobile/MobilePlayingIndicator.tsx
export default function MobilePlayingIndicator({ playing }: { playing: boolean }) {
    const { t } = useTranslation();
    return (
        <span className="ml-song-playing" data-playing={playing} aria-label={t('mobileLibrary.nowPlaying')}>
            <i />
            <i />
            <i />
            <i />
        </span>
    );
}

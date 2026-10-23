import React, { useState } from 'react';
import { Compass, ArrowUpRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import type { LibraryHomeOnlineSource } from '../../core/contracts/homeModel';
import { usePersonalFmModeStore } from '../../../stores/usePersonalFmModeStore';

// src/library/suites/mobile/MobileExplore.tsx
export default function MobileExplore({ props, source }: { props: LibraryHomeSurfaceProps; source: LibraryHomeOnlineSource }) {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const run = async () => {
        if (busy) return;
        if (!source.user || source.needsRelogin) { void props.account.startLogin(source.providerId); return; }
        setBusy(true); setError(false);
        try {
            if (source.hasPersonalFmModes) usePersonalFmModeStore.getState().setSelection({ mode: 'EXPLORE', scene: null });
            const result = await props.homeResources.actions.playPersonalFm(source.hasPersonalFmModes ? { mode: 'EXPLORE' } : undefined);
            setError(!result.ok);
        } finally { setBusy(false); }
    };
    return <section className="ml-explore-section">
        <h2>{t('mobileEnhancements.explore')}</h2>
        <button className="ml-explore-card" disabled={busy} onClick={() => void run()}>
            <span className="ml-explore-orb">{busy ? <Loader2 className="animate-spin" /> : <Compass size={28} />}</span>
            <span><strong>{t(source.hasPersonalFmModes ? 'mobileEnhancements.exploreTitle' : 'mobileEnhancements.radioTitle')}</strong>
                <small>{source.providerLabel} · {t('mobileEnhancements.exploreDescription')}</small></span>
            <ArrowUpRight size={22} />
        </button>
        {error && <p role="status" className="ml-error">{t('mobileLibrary.recommendationUnavailable')}</p>}
    </section>;
}

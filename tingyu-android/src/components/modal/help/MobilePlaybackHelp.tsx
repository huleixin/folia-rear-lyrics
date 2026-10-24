import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlayCircle } from 'lucide-react';

// src/components/modal/help/MobilePlaybackHelp.tsx
// Phone instructions describe existing touch actions instead of advertising desktop keyboard commands.
export default function MobilePlaybackHelp() {
    const { t } = useTranslation();
    return <section className="ty-settings-feature">
        <h3 className="ty-settings-group-title"><PlayCircle size={16} />{t('mobileSettings.touchHelpTitle')}</h3>
        <dl className="ty-settings-card p-4 space-y-4">
            {['touchStage', 'touchTransport', 'touchQueue'].map(key => <div key={key}>
                <dt className="text-sm font-medium">{t(`mobileSettings.${key}Title`)}</dt>
                <dd className="ty-settings-description">{t(`mobileSettings.${key}Description`)}</dd>
            </div>)}
        </dl>
    </section>;
}

import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlayCircle } from 'lucide-react';

// src/components/modal/help/MobilePlaybackHelp.tsx
// Phone instructions describe existing touch actions instead of advertising desktop keyboard commands.
export default function MobilePlaybackHelp() {
    const { t } = useTranslation();
    return <section className="ty-settings-feature" data-settings-style='{"margin":[0,0,0,16]}' data-settings-layout="column">
        <h3 className="ty-settings-group-title" data-settings-style='{"gap":10,"font":13,"weight":500,"tone":"muted","margin":[2,0,2,8]}' data-settings-layout="row"><PlayCircle size={16} />{t('mobileSettings.touchHelpTitle')}</h3>
        <dl className="ty-settings-card p-4 space-y-4" data-settings-style='{"gap":16,"padding":[16,16,16,16],"border":true,"radius":14}' data-settings-layout="card">
            {['touchStage', 'touchTransport', 'touchQueue'].map(key => <div key={key} data-settings-layout="column">
                <dt className="text-sm font-medium" data-settings-style='{"font":14,"weight":500}' data-settings-layout="column">{t(`mobileSettings.${key}Title`)}</dt>
                <dd className="ty-settings-description" data-settings-style='{"font":12,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">{t(`mobileSettings.${key}Description`)}</dd>
            </div>)}
        </dl>
    </section>;
}

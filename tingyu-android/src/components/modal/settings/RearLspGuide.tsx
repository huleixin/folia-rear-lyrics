import React from 'react';
import { useTranslation } from 'react-i18next';

// src/components/modal/settings/RearLspGuide.tsx
export default function RearLspGuide() {
    const { t } = useTranslation();
    return <aside aria-label={t('rearBridge.tutorialTitle')} className="ty-settings-card" data-testid="rear-lsp-guide" data-settings-style='{"border":true,"radius":14,"padding":[16,16,16,16],"gap":12}' data-settings-layout="card">
        <h2 data-settings-style='{"font":20,"weight":600}' data-settings-layout="wrap">{t('rearBridge.tutorialTitle')}</h2>
        <ol className="list-decimal pl-5 space-y-2 text-xs leading-relaxed" data-settings-style='{"gap":8,"font":12,"padding":[20,0,0,0]}' data-settings-layout="column" data-settings-list="ordered">
            {['install','scope','reboot','select','start'].map(step => <li key={step} data-settings-layout="column">{t(`rearBridge.tutorial.${step}`)}</li>)}
        </ol>
        <p className="mt-3 text-xs leading-relaxed" data-settings-style='{"font":12,"margin":[0,12,0,0]}' data-settings-layout="wrap">{t('rearBridge.updateNotice')}</p>
        <p className="mt-2 text-xs leading-relaxed" data-settings-style='{"font":12,"margin":[0,8,0,0]}' data-settings-layout="wrap">{t('rearBridge.failureNotice')}</p>
    </aside>;
}

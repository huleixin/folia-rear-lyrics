import React from 'react';
import { useTranslation } from 'react-i18next';

// src/components/modal/settings/RearLspGuide.tsx
export default function RearLspGuide() {
    const { t } = useTranslation();
    return <section className="ty-settings-card" data-testid="rear-lsp-guide">
        <h2>{t('rearBridge.tutorialTitle')}</h2>
        <ol className="list-decimal pl-5 space-y-2 text-xs leading-relaxed">
            {['install','scope','reboot','select','start'].map(step => <li key={step}>{t(`rearBridge.tutorial.${step}`)}</li>)}
        </ol>
        <p className="mt-3 text-xs leading-relaxed">{t('rearBridge.updateNotice')}</p>
        <p className="mt-2 text-xs leading-relaxed">{t('rearBridge.failureNotice')}</p>
    </section>;
}

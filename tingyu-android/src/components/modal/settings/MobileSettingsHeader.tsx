import React from 'react';
import { ChevronLeft, CircleHelp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// src/components/modal/settings/MobileSettingsHeader.tsx
export default function MobileSettingsHeader({ primary, title, onBack, onHelp, onClose }: {
    primary: boolean; title: string; onBack: () => void; onHelp?: () => void; onClose: () => void;
}) {
    const { t } = useTranslation();
    return <header data-native-settings-header className={`ty-settings-header ${primary ? 'ty-settings-header-primary' : ''}`} data-settings-layout="column">
        {!primary && <button type="button" onClick={onBack} aria-label={t('mobileSettings.back')} data-settings-layout="row"><ChevronLeft size={24} /></button>}
        <h1 data-settings-style='{"font":22,"weight":600}' data-settings-layout="wrap">{title}</h1>
        {primary ? <button type="button" className="ty-settings-close" onClick={onClose} aria-label={t('ui.close')} data-settings-layout="row"><X size={23} /></button>
            : onHelp && <button type="button" onClick={onHelp} aria-label={t('mobileSettings.usageGuide')} data-settings-layout="row"><CircleHelp size={21} /></button>}
    </header>;
}

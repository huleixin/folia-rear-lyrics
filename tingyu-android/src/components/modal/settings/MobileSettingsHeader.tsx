import React from 'react';
import { ChevronLeft, CircleHelp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// src/components/modal/settings/MobileSettingsHeader.tsx
export default function MobileSettingsHeader({ primary, title, onBack, onHelp, onClose }: {
    primary: boolean; title: string; onBack: () => void; onHelp?: () => void; onClose: () => void;
}) {
    const { t } = useTranslation();
    return <header className={`ty-settings-header ${primary ? 'ty-settings-header-primary' : ''}`}>
        {!primary && <button type="button" onClick={onBack} aria-label={t('mobileSettings.back')}><ChevronLeft size={24} /></button>}
        <h1>{title}</h1>
        {primary ? <button type="button" className="ty-settings-close" onClick={onClose} aria-label={t('ui.close')}><X size={23} /></button>
            : onHelp && <button type="button" onClick={onHelp} aria-label={t('mobileSettings.usageGuide')}><CircleHelp size={21} /></button>}
    </header>;
}

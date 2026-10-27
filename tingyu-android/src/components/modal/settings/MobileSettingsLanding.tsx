import React, { lazy, Suspense, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import MobileSettingsNavigation from './navigation/MobileSettingsNavigation';
import MobileSettingsHeader from './MobileSettingsHeader';
import { buildSettingsNavGroups, type SettingsSectionId } from './navigation/settingsNavModel';
import { writeLastSettingsSection } from './navigation/settingsLastSection';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { useNativeSettingsPage } from './useNativeSettingsPage';
import { warmSettingsModule } from '../../app/dialogs/settingsModule';
import { useNativeSettingsDocument } from '../../../hooks/useNativeSettingsDocument';
import './mobileSettings.css';

// src/components/modal/settings/MobileSettingsLanding.tsx
// The phone index does not load every graphics/editor settings module on its first tap.
const RearLyricsGuide = lazy(() => import('./RearLyricsGuide'));
export default function MobileSettingsLanding({ onClose }: { onClose: () => void }) {
    useEffect(()=>{const id=setTimeout(warmSettingsModule,400);return()=>clearTimeout(id)},[]);
    const { t } = useTranslation();
    const [guide, setGuide] = useState(false);
    const groups = useMemo(() => buildSettingsNavGroups(t, { isElectron: false }), [t]);
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const key = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (guide) setGuide(false); else onClose();
        };
        window.addEventListener('keydown', key, true);
        return () => { window.removeEventListener('keydown', key, true); before?.isConnected && before.focus(); };
    }, [guide, onClose]);
    const select = (section: SettingsSectionId) => {
        writeLastSettingsSection(section, { isElectron: false });
        useSettingsModalStore.getState().openSettingsFromIndex(section);
    };
    const root=useRef<HTMLDivElement>(null);
    const help=()=>useSettingsModalStore.getState().openSettingsFromIndex('help');
    const native=useNativeSettingsPage(root,guide,onClose,()=>setGuide(true),groups,select,help);
    useNativeSettingsDocument(root,guide,'rear-guide',t('mobileSettings.startupGuide'));
    return createPortal(<div ref={root} data-folia-settings-overlay="true" data-mobile-settings="true"
        data-folia-keyboard-window="true" data-testid="mobile-settings-landing" className="fixed inset-0" style={{ zIndex: 136 }}>
        {(!native||guide)&&<div data-folia-settings-panel="true" role="dialog" aria-modal="true" aria-label={t('ui.options')}
            className="flex flex-col overflow-hidden h-full" style={{ color: '#e8f4ed' }}>
            <MobileSettingsHeader primary={!guide} title={t(guide ? 'mobileSettings.startupGuide' : 'ui.options')}
                onBack={() => setGuide(false)} onClose={onClose} />
            {guide ? <div className="flex-1 overflow-y-auto px-5"><Suspense fallback={null}><RearLyricsGuide /></Suspense></div>
                : <MobileSettingsNavigation groups={groups} index onSelect={select} onHelp={help}
                    onGuide={() => setGuide(true)} />}
        </div>}
    </div>, document.body);
}

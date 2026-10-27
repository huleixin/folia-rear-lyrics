import React, { lazy, Suspense, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import MobileSettingsNavigation from './navigation/MobileSettingsNavigation';
import MobileSettingsHeader from './MobileSettingsHeader';
import { buildSettingsNavGroups, type SettingsSectionId } from './navigation/settingsNavModel';
import { writeLastSettingsSection } from './navigation/settingsLastSection';
import { openSettings } from '../../../stores/useSettingsModalStore';
import { useNativePage } from '../../../hooks/useNativePage';
import { useRearLyricsSettings } from './useRearLyricsSettings';
import { rearSettingsCanToggle, rearSettingsState, rearSettingsHint } from './rearLyricsSettingsModel';
import type { NativePageModel, PageActions, PageSection } from '../../../types/nativePages';
import './mobileSettings.css';

// src/components/modal/settings/MobileSettingsLanding.tsx
// The phone index does not load every graphics/editor settings module on its first tap.
const RearLyricsGuide = lazy(() => import('./RearLyricsGuide'));
export default function MobileSettingsLanding({ onClose }: { onClose: () => void }) {
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
        openSettings('options', section);
    };
    const root=useRef<HTMLDivElement>(null);
    const rear=useRearLyricsSettings(!guide);
    const actions:PageActions={close:onClose,guide:()=>setGuide(true),help:()=>openSettings('help'),rear:()=>{void rear.toggle()},refresh:()=>{void rear.refresh()}};
    const sections:PageSection[]=[];
    if(rear.available)sections.push({id:'rear',title:t('options.rearLyricsTitle'),layout:'rows',items:[{
        id:'toggle',title:t(rear.snapshot?.enabled?'options.rearLyricsReturn':'mobileSettings.rearEnable'),
        subtitle:t(`mobileSettings.rearState.${rearSettingsState(rear.snapshot,rear.failed)}`),action:'rear',
        disabled:rear.failed||!rearSettingsCanToggle(rear.snapshot,rear.busy),selected:rear.snapshot?.enabled===true,
    },{id:'guide',title:t('mobileSettings.startupGuide'),action:'guide'},
        {id:'refresh',title:'刷新背屏状态',subtitle:rearSettingsHint(rear.snapshot)?t(rearSettingsHint(rear.snapshot)!):undefined,action:'refresh'}]});
    for(const group of groups)sections.push({id:group.id,title:group.label,layout:'rows',items:group.items.map(item=>{
        actions[`settings:${item.id}`]=()=>select(item.id);
        return{id:item.id,title:item.label,subtitle:item.description,action:`settings:${item.id}`};
    })});
    sections.push({id:'about',layout:'rows',items:[{id:'about',title:t('mobileSettings.about'),subtitle:t('mobileSettings.aboutDescription'),action:'help'}]});
    const model:NativePageModel={key:'settings:index',title:t('ui.options'),leading:'close',bottomClearance:28,sections};
    const native=useNativePage(root,'settings',!guide,model,actions);
    return createPortal(<div key={guide?'guide':'index'} ref={guide?undefined:root} data-folia-settings-overlay="true" data-mobile-settings="true"
        data-folia-keyboard-window="true" data-testid="mobile-settings-landing" className="fixed inset-0" style={{ zIndex: 136 }}>
        {(!native||guide)&&<div data-folia-settings-panel="true" role="dialog" aria-modal="true" aria-label={t('ui.options')}
            className="flex flex-col overflow-hidden h-full" style={{ color: '#e8f4ed' }}>
            <MobileSettingsHeader primary={!guide} title={t(guide ? 'mobileSettings.startupGuide' : 'ui.options')}
                onBack={() => setGuide(false)} onClose={onClose} />
            {guide ? <div className="flex-1 overflow-y-auto px-5"><Suspense fallback={null}><RearLyricsGuide /></Suspense></div>
                : <MobileSettingsNavigation groups={groups} index onSelect={select} onHelp={() => openSettings('help')}
                    onGuide={() => setGuide(true)} />}
        </div>}
    </div>, document.body);
}

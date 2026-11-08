import React, { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import MobileSettingsNavigation from './navigation/MobileSettingsNavigation';
import MobileSettingsHeader from './MobileSettingsHeader';
import { buildSettingsNavGroups, type SettingsSectionId } from './navigation/settingsNavModel';
import { writeLastSettingsSection } from './navigation/settingsLastSection';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { runTopModalBack } from '../../../services/modalBackStack';
import { useNativeSettingsPage } from './useNativeSettingsPage';
import { scheduleSettingsWarmup } from '../../app/dialogs/settingsModule';
import { useNativeSettingsDocument } from '../../../hooks/useNativeSettingsDocument';
import { useInterfaceLight } from '../../../hooks/useInterfaceAppearance';
import {useRearSettingsController} from './useRearSettingsController';
import {buildRearControlPage,rearPageBack,type RearSettingsPage} from './rearControlModel';
import {rearControlActions} from './rearControlActions';
import RearControlView from './RearControlView';
import RearBridgeSettings from './RearBridgeSettings';
import RearLyricsEntry from './RearLyricsEntry';
import './mobileSettings.css';

// src/components/modal/settings/MobileSettingsLanding.tsx
// The phone index does not load every graphics/editor settings module on its first tap.
const RearAppearance=lazy(()=>import('./RearStageAppearancePage'));
const RearLyricsGuide = lazy(() => import('./RearLyricsGuide'));
export default function MobileSettingsLanding({ onClose }: { onClose: () => void }) {
    useEffect(scheduleSettingsWarmup,[]);
    const { t } = useTranslation();
    const lightInterface=useInterfaceLight();
    const rear=useRearSettingsController();
    const page=useSettingsModalStore(s=>s.settingsModalState.rearPage)??'index';
    const openPage=(next:RearSettingsPage)=>useSettingsModalStore.getState().openRearSettings(next);
    const back=()=>{if(page==='index')onClose();else if(rearPageBack(page)==='index')useSettingsModalStore.getState().returnSettingsToIndex();else openPage(rearPageBack(page) as RearSettingsPage);};
    const appearance=page.startsWith('appearance');
    const editor=page==='appearance-editor'||page==='appearance-theme';
    const appearanceTitle=page==='appearance-backup'?'rearAppearance.backup':page==='appearance-editor'?'rearAppearance.edit':page==='appearance-theme'?'rearAppearance.theme':'rearAppearance.title';
    const guide=page==='guide'||page==='diagnostics'||appearance;
    const groups = useMemo(() => buildSettingsNavGroups(t, { isElectron: false }), [t]);
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const key = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // 栈顶模态优先（modalBackStack 契约）：设置页之上若开着 ThemedDialog 类弹层，
            // 返回先关它，而不是把设置页退一层留下孤儿弹层（68599 同类问题的键盘 Escape 面）。
            if (runTopModalBack()) return;
            event.preventDefault(); event.stopImmediatePropagation();
            back();
        };
        window.addEventListener('keydown', key, true);
        return () => { window.removeEventListener('keydown', key, true); before?.isConnected && before.focus(); };
    }, [page, onClose]);
    const select = (section: SettingsSectionId) => {
        writeLastSettingsSection(section, { isElectron: false });
        useSettingsModalStore.getState().openSettingsFromIndex(section);
    };
    const root=useRef<HTMLDivElement>(null);
    const help=()=>useSettingsModalStore.getState().openSettingsFromIndex('help');
    const native=useNativeSettingsPage(root,page,onClose,openPage,groups,select,help,rear,back);
    useNativeSettingsDocument(root,guide,`rear-${page}`,t(appearance?appearanceTitle:page==='diagnostics'?'rearControl.diagnostics':'mobileSettings.startupGuide'));
    const model=buildRearControlPage(page==='advanced'?'advanced':'control',rear,t);
    const actions=rearControlActions(rear,openPage,back);
    return createPortal(<div ref={root} data-folia-settings-overlay="true" data-mobile-settings="true"
        data-folia-keyboard-window="true" data-testid="mobile-settings-landing" className="fixed inset-0" style={{ zIndex: 136 }}>
        {(!native||guide)&&<div data-folia-settings-panel="true" role="dialog" aria-modal="true" aria-label={t('ui.options')}
            className="flex flex-col overflow-hidden h-full" style={{ color: lightInterface ? '#213e34' : '#e8f4ed' }}>
            <MobileSettingsHeader primary={page==='index'} title={t(appearance?appearanceTitle:page==='index'?'ui.options':page==='guide'?'mobileSettings.startupGuide':page==='diagnostics'?'rearControl.diagnostics':page==='advanced'?'rearControl.advanced':'rearControl.title')}
                onBack={back} onClose={onClose} />
            {guide ? <div className={editor?"ty-rear-editor-host":"ty-rear-page-scroll"}><Suspense fallback={null}>{appearance?<RearAppearance page={page as RearSettingsPage} open={openPage}/>:<RearLyricsGuide backend={rear.snapshot?.backendMode} diagnosticsOnly={page==='diagnostics'} />}</Suspense></div>
                : page!=='index'?<div className="ty-rear-page-scroll">{page==='advanced'?<RearBridgeSettings rear={rear} actions={actions}/>:<RearControlView model={model} actions={actions}/>}</div>
                : <MobileSettingsNavigation groups={groups} index onSelect={select} onHelp={help}
                    onGuide={() => openPage('control')} rearEntry={<RearLyricsEntry state={rear} onOpen={()=>openPage('control')}/>} />}
        </div>}
    </div>, document.body);
}

import React, {lazy, Suspense, useEffect, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import type {DualTheme} from '../../../types';
import MobileSettingsHeader from './MobileSettingsHeader';
import {loadRearThemeEditor, warmRearThemeEditor} from './rearAppearanceModules';
import './rearControl.css';

// src/components/modal/settings/FrontStageAppearancePage.tsx
// Reuse the rear editor's page chrome, while saving exclusively through the front theme controller.
const ThemeEditor=lazy(loadRearThemeEditor);
export default function FrontStageAppearancePage({page,editingTheme,initialTheme,isDaylight,onBack,onSaveTheme,children}: {
    page:boolean;editingTheme:boolean;initialTheme:DualTheme;isDaylight:boolean;
    onBack:()=>void;onSaveTheme:(theme:DualTheme)=>void;children:ReactNode;
}) {
    const {t}=useTranslation();
    useEffect(()=>page?warmRearThemeEditor():undefined,[page]);
    if(!page)return children;
    return <div className="fixed inset-0 z-[140] flex flex-col" data-native-settings-editor data-front-stage-settings="true"
        data-folia-settings-overlay="true" data-mobile-settings="true" data-settings-layout="column">
        <div data-folia-settings-panel="true" className="flex h-full min-h-0 flex-col overflow-hidden" data-settings-style='{"minHeight":0}' data-settings-layout="column">
            <MobileSettingsHeader primary={false} title={t(editingTheme?'rearAppearance.theme':'rearAppearance.edit')} onBack={onBack} onClose={onBack}/>
            <div className="ty-rear-editor-host" data-settings-layout="column">
                {editingTheme?<Suspense fallback={<p className="ty-rear-editor-loading" data-settings-layout="wrap">{t('rearAppearance.loading')}</p>}>
                    <ThemeEditor presentation="page" kind="custom" initialTheme={initialTheme} isDaylight={isDaylight}
                        paletteHint={t('frontAppearance.paletteHint',{mode:t(isDaylight?'options.lightTheme':'options.darkTheme')})}
                        coverUrl={null} promptSourceText={null} isPureMusic={false} songTitle={undefined}
                        onClose={onBack} onSave={onSaveTheme}/>
                </Suspense>:children}
            </div>
        </div>
    </div>;
}

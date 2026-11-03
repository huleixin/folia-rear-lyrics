import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import { isAndroidNativeRuntime } from '../../../utils/platform';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import SettingsRow, { SettingsToggle } from './SettingsRow';
import { Captions } from 'lucide-react';
import { settingsDividerClassFor } from './settingsCardClasses';
import { useTypographySettingsStore } from '../../../stores/useTypographySettingsStore';
import { usePlayerViewModeStore, type PlayerViewMode } from '../../../stores/usePlayerViewModeStore';

// src/components/modal/settings/MobilePlayerDisplaySetting.tsx
// Keep the effective front-stage subtitle preference in visual settings, separate from obsolete chrome controls.

const VIEW_CHOICES: readonly PlayerViewMode[] = ['minimal', 'stage'];

export default function MobilePlayerDisplaySetting({ isDaylight, settingsCardClass, theme }: {
    isDaylight: boolean; settingsCardClass: string; theme?: Theme;
}) {
    const { t } = useTranslation();
    const hidden = useTypographySettingsStore(state => state.hidePlayerTranslationSubtitle);
    const toggle = useTypographySettingsStore(state => state.handleToggleHidePlayerTranslationSubtitle);
    const viewMode = usePlayerViewModeStore(state => state.mode);
    if (!isAndroidNativeRuntime()) return null;
    // The chosen surface is a preference, not a mode switch: the rear stage, the AOD card and the
    // LSP bridge keep reading their own settings and never look at this value.
    const activeColor = theme?.secondaryColor;
    return <SettingsAnchor anchorId="mobilePlayerDisplay" label={t('mobileSettings.playerDisplay')}>
        <SettingsSectionHeading icon={Captions} label={t('mobileSettings.playerDisplay')} />
        <div className={`rounded-xl border ${settingsCardClass}`}>
            <SettingsRow title={t('minimalStage.view')} description={t('minimalStage.viewDescription')} note={t('minimalStage.viewNote')}
                dividerClass={settingsDividerClassFor(isDaylight)} control={null}>
                <div role="radiogroup" aria-label={t('minimalStage.view')}
                    className="flex gap-1 rounded-lg p-1"
                    style={{ background: isDaylight ? 'rgba(16,35,29,.06)' : 'rgba(255,255,255,.07)' }}>
                    {VIEW_CHOICES.map(choice => {
                        const selected = viewMode === choice;
                        return <button key={choice} type="button" role="radio" aria-checked={selected}
                            className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                            style={selected
                                ? { background: activeColor || 'var(--text-primary)', color: isDaylight ? '#fff' : '#08130f' }
                                : { color: 'var(--text-secondary)', opacity: 0.7 }}
                            onClick={() => usePlayerViewModeStore.getState().setMode(choice)}>
                            {t(choice === 'minimal' ? 'minimalStage.viewMinimal' : 'minimalStage.viewStage')}
                        </button>;
                    })}
                </div>
            </SettingsRow>
            <SettingsRow title={t('options.hidePlayerTranslationSubtitle')} description={t('mobileSettings.subtitleDescription')} isLast dividerClass=""
                control={<SettingsToggle checked={hidden} onChange={() => toggle(!hidden)}
                    ariaLabel={t('options.hidePlayerTranslationSubtitle')} offClass={isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]'} onColor={theme?.secondaryColor} />} />
        </div>
    </SettingsAnchor>;
}

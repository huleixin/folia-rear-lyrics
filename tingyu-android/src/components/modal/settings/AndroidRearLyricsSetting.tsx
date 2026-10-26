import React, { useState } from 'react';
import { Activity, Captions, ChevronRight, Info, LoaderCircle, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { rearSettingsCanToggle, rearSettingsHint, rearSettingsState } from './rearLyricsSettingsModel';
import { useRearLyricsSettings } from './useRearLyricsSettings';
import RearLyricsGuide from './RearLyricsGuide';
import RearBridgeSettings from './RearBridgeSettings';
import rearDecoration from '../../../../assets/tingyu/xiaomi-backscreen-decoration.webp';

// src/components/modal/settings/AndroidRearLyricsSetting.tsx
type Props = {
    isDaylight: boolean; settingsCardClass: string; theme?: { secondaryColor?: string } | null;
    compact?: boolean; onOpenGuide?: () => void;
};

export default function AndroidRearLyricsSetting({ isDaylight, settingsCardClass, theme, compact = false, onOpenGuide }: Props) {
    const { t } = useTranslation();
    const { available, snapshot, busy, failed, actionFailed, refresh, toggle } = useRearLyricsSettings();
    const [showGuide, setShowGuide] = useState(false);
    if (!available) return null;
    const enabled = snapshot?.enabled === true;
    const state = rearSettingsState(snapshot, failed);
    const hint = rearSettingsHint(snapshot);
    const canToggle = !failed && rearSettingsCanToggle(snapshot, busy);
    const revision = snapshot?.build == null ? '' : `r${String(snapshot.build).replace(/^r/i, '')}`;
    const adaptation = [revision, (snapshot?.rearDisplayId ?? -1) >= 0
        ? t('options.rearLyricsDetected', { id: snapshot?.rearDisplayId })
        : t(`mobileSettings.rearState.${failed ? 'failed' : typeof snapshot?.rearDisplayId === 'number' && snapshot.rearDisplayId < 0 ? 'unsupported' : 'detecting'}`)]
        .filter(Boolean).join(' · ');

    return <div role="region" className={compact ? 'ty-settings-feature' : 'space-y-4'} aria-label={t('options.rearLyricsTitle')}>
        {compact ? <h2 className="ty-settings-group-title"><Captions size={16} />{t('options.rearLyricsTitle')}</h2>
            : <SettingsSectionHeading icon={Captions} label={t('options.rearLyricsTitle')} />}
        <div className={compact ? 'ty-settings-card ty-rear-card' : `p-4 rounded-xl border ${settingsCardClass}`}>
            <div className={compact ? 'ty-rear-intro' : 'flex items-start justify-between gap-4'}>
                {compact && <span className="ty-rear-decoration" aria-hidden="true">
                    <img src={rearDecoration} alt="" width={1774} height={887} decoding="async" draggable={false} />
                </span>}
                <div className="min-w-0">
                    <h3 className={compact ? 'ty-settings-feature-title' : 'text-sm font-medium'}>{t('options.rearLyricsTitle')}</h3>
                    <p className={compact ? 'ty-settings-description' : 'text-xs opacity-60 leading-relaxed mt-2'}>{t('mobileSettings.rearDescription')}</p>
                </div>
                <button type="button" role="switch" aria-checked={enabled} aria-label={t('options.rearLyricsTitle')}
                    onClick={() => void toggle()} disabled={!canToggle}
                    className={compact ? 'ty-rear-toggle' : `px-3 py-2 rounded-lg text-sm shrink-0 disabled:opacity-50 ${isDaylight ? 'bg-zinc-200' : 'bg-white/10'}`}
                    style={!compact && enabled ? { backgroundColor: theme?.secondaryColor } : undefined}>
                    {busy || snapshot?.starting ? <LoaderCircle size={16} className="animate-spin" /> : null}
                    {enabled ? t('options.rearLyricsReturn') : t('mobileSettings.rearEnable')}<ChevronRight size={16} />
                </button>
            </div>
            <div className={compact ? 'ty-settings-detail-row' : 'flex items-center gap-3 mt-4'}>
                <span className="ty-setting-symbol"><Smartphone size={20} /></span>
                <span className="ty-settings-row-copy"><strong>{t('mobileSettings.rearAdaptation')}</strong><small>{adaptation}</small></span>
            </div>
            <div className={compact ? 'ty-settings-detail-row' : 'flex items-center gap-3 mt-3'}>
                <span className="ty-setting-symbol"><Activity size={20} /></span>
                <span className="ty-settings-row-copy"><strong>{t('mobileSettings.currentStatus')}</strong>
                    <small role="status" className={`ty-rear-status ty-rear-status-${state}`}>{t(state === 'system' ? 'rearBridge.system' : `mobileSettings.rearState.${state}`)}</small>
                </span>
                {failed && <button type="button" className="ty-settings-text-action" onClick={() => void refresh()}>{t('mobileSettings.retryDetection')}</button>}
            </div>
            {(hint || actionFailed) && <p className="ty-settings-inline-status" role="status">{hint ? t(hint) : t('mobileSettings.rearActionFailed')}</p>}
            <RearBridgeSettings snapshot={snapshot} refresh={refresh} />
            <button type="button" className={compact ? 'ty-settings-row ty-rear-guide-link' : 'flex items-center gap-3 mt-4 w-full text-left'}
                onClick={() => onOpenGuide ? onOpenGuide() : setShowGuide(value => !value)} aria-expanded={onOpenGuide ? undefined : showGuide}>
                <span className="ty-setting-symbol"><Info size={20} /></span>
                <span className="ty-settings-row-copy"><strong>{t('mobileSettings.startupGuide')}</strong><small>{t('mobileSettings.startupGuideDescription')}</small></span><ChevronRight size={18} />
            </button>
            {!onOpenGuide && showGuide && <RearLyricsGuide />}
        </div>
    </div>;
}

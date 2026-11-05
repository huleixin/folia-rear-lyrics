import React from 'react';
import { Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { useAndroidLayoutSettingsStore } from '../../../stores/useAndroidLayoutSettingsStore';

// src/components/modal/settings/AndroidKeepScreenOnSetting.tsx
// 「屏幕常亮」：界面设置里的开关，打开后播放期间不再自动息屏（安卓走原生窗口标志）。
// 与其它安卓专属开关一样，只在安卓容器里渲染，桌面和网页版不显示。

type AndroidKeepScreenOnSettingProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: { secondaryColor?: string } | null;
};

const isAndroidNativeRuntime = (): boolean => (
    typeof window !== 'undefined'
    && (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'android'
);

const AndroidKeepScreenOnSetting: React.FC<AndroidKeepScreenOnSettingProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
}) => {
    const { t } = useTranslation();
    const enabled = useAndroidLayoutSettingsStore(state => state.keepScreenOnEnabled);
    const setEnabled = useAndroidLayoutSettingsStore(state => state.setKeepScreenOnEnabled);
    const lyricsKeepOn = useAndroidLayoutSettingsStore(state => state.minimalLyricsKeepOnEnabled);
    const setLyricsKeepOn = useAndroidLayoutSettingsStore(state => state.setMinimalLyricsKeepOnEnabled);

    if (!isAndroidNativeRuntime()) return null;

    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]';

    return (
        <div className="space-y-4">
            <SettingsSectionHeading icon={Sun} label={t('options.keepScreenOn')} />
            <div className={`p-4 rounded-xl border ${settingsCardClass}`}>
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t('options.keepScreenOn')}
                        </div>
                        <div className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {t('options.keepScreenOnDesc')}
                        </div>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={t('options.keepScreenOn')}
                        onClick={() => setEnabled(!enabled)}
                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!enabled ? toggleOffBackgroundClass : ''}`}
                        style={{ backgroundColor: enabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
            {/* 极简歌词页常亮：独立开关、默认关。是否真的常亮由原生宿主按「当前是否
                停在极简歌词页」判定（切回封面/退出播放器/顺访完整舞台/退后台立即释放），
                与上面的全局常亮互不覆盖。 */}
            <div className={`p-4 rounded-xl border ${settingsCardClass}`}>
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t('options.minimalLyricsKeepOn')}
                        </div>
                        <div className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {t('options.minimalLyricsKeepOnDesc')}
                        </div>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={lyricsKeepOn}
                        aria-label={t('options.minimalLyricsKeepOn')}
                        onClick={() => setLyricsKeepOn(!lyricsKeepOn)}
                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!lyricsKeepOn ? toggleOffBackgroundClass : ''}`}
                        style={{ backgroundColor: lyricsKeepOn ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${lyricsKeepOn ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AndroidKeepScreenOnSetting;

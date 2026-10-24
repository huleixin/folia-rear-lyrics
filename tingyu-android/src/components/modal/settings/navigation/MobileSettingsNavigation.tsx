import React, { useLayoutEffect, useRef } from 'react';
import { ChevronRight, CircleHelp, Database, PlayCircle, Settings2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SettingsNavGroup, SettingsSectionId } from './settingsNavModel';
import AndroidRearLyricsSetting from '../AndroidRearLyricsSetting';
import AndroidImmersiveSetting from '../AndroidImmersiveSetting';
import '../mobileSettings.css';

// src/components/modal/settings/navigation/MobileSettingsNavigation.tsx
export default function MobileSettingsNavigation({ groups, index, onSelect, onGuide, onHelp }: {
    groups: SettingsNavGroup[]; index: boolean; onSelect: (id: SettingsSectionId) => void; onGuide: () => void; onHelp: () => void;
}) {
    const { t } = useTranslation();
    const scroller = useRef<HTMLDivElement>(null);
    const previousScroll = useRef(0);
    useLayoutEffect(() => {
        const node = scroller.current;
        if (!node) return;
        node.scrollTop = previousScroll.current;
        return () => { previousScroll.current = node.scrollTop; };
    }, [index]);
    if (!index) return null;
    const symbols = { appearance: Sparkles, controls: PlayCircle, connections: Database, system: Settings2 };
    return <div className="ty-settings-home" data-mobile-settings-home="true" ref={scroller}>
        <AndroidRearLyricsSetting isDaylight={false} settingsCardClass="ty-settings-card" compact onOpenGuide={onGuide} />
        <AndroidImmersiveSetting isDaylight={false} settingsCardClass="ty-settings-card" compact />
        <nav className="ty-settings-navigation" aria-label={t('ui.options')}>
            {groups.map(group => {
                const Icon = symbols[group.id as keyof typeof symbols] ?? Settings2;
                return <section key={group.id} className="ty-settings-feature">
                    <h2 className="ty-settings-group-title"><Icon size={16} />{group.label}</h2>
                    <div className="ty-settings-card">
                        {group.items.map(item => <button type="button" key={item.id} className="ty-settings-row" onClick={() => onSelect(item.id)}>
                            <span className="ty-setting-symbol"><item.icon size={21} /></span>
                            <span className="ty-settings-row-copy"><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={18} />
                        </button>)}
                        {group.id === 'system' && <button type="button" className="ty-settings-row" onClick={onHelp}>
                            <span className="ty-setting-symbol"><CircleHelp size={21} /></span>
                            <span className="ty-settings-row-copy"><strong>{t('mobileSettings.about')}</strong><small>{t('mobileSettings.aboutDescription')}</small></span><ChevronRight size={18} />
                        </button>}
                    </div>
                </section>;
            })}
        </nav>
    </div>;
}

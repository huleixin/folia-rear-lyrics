import React, { useLayoutEffect, useRef } from 'react';
import { ChevronRight, CircleHelp, Database, PlayCircle, Settings2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SettingsNavGroup, SettingsSectionId } from './settingsNavModel';
import AndroidRearLyricsSetting from '../AndroidRearLyricsSetting';
import '../mobileSettings.css';

// src/components/modal/settings/navigation/MobileSettingsNavigation.tsx
export default function MobileSettingsNavigation({ groups, index, onSelect, onGuide, onHelp, rearEntry }: {
    groups: SettingsNavGroup[]; index: boolean; onSelect: (id: SettingsSectionId) => void; onGuide: () => void; onHelp: () => void;rearEntry?:React.ReactNode;
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
    return <div className="ty-settings-home" data-mobile-settings-home="true" ref={scroller} data-settings-layout="column">
        {rearEntry??<AndroidRearLyricsSetting isDaylight={false} settingsCardClass="ty-settings-card" compact onOpenGuide={onGuide} />}
        <nav className="ty-settings-navigation" aria-label={t('ui.options')} data-settings-layout="column">
            {groups.map(group => {
                const Icon = symbols[group.id as keyof typeof symbols] ?? Settings2;
                return <section key={group.id} className="ty-settings-feature" data-settings-style='{"margin":[0,0,0,16]}' data-settings-layout="column">
                    <h2 className="ty-settings-group-title" data-settings-style='{"gap":10,"font":13,"weight":500,"tone":"muted","margin":[2,0,2,8]}' data-settings-layout="row"><Icon size={16} />{group.label}</h2>
                    <div className="ty-settings-card" data-settings-style='{"border":true,"radius":14}' data-settings-layout="card">
                        {group.items.map(item => <button type="button" key={item.id} className="ty-settings-row" onClick={() => onSelect(item.id)} data-settings-style='{"align":"center","gap":12,"padding":[14,8,14,8],"minHeight":48}' data-settings-layout="row">
                            <span className="ty-setting-symbol" data-settings-layout="wrap"><item.icon size={21} /></span>
                            <span className="ty-settings-row-copy" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column"><strong data-settings-layout="wrap">{item.label}</strong><small data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{item.description}</small></span><ChevronRight size={18} />
                        </button>)}
                        {group.id === 'system' && <button type="button" className="ty-settings-row" onClick={onHelp} data-settings-style='{"align":"center","gap":12,"padding":[14,8,14,8],"minHeight":48}' data-settings-layout="row">
                            <span className="ty-setting-symbol" data-settings-layout="wrap"><CircleHelp size={21} /></span>
                            <span className="ty-settings-row-copy" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column"><strong data-settings-layout="wrap">{t('mobileSettings.about')}</strong><small data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{t('mobileSettings.aboutDescription')}</small></span><ChevronRight size={18} />
                        </button>}
                    </div>
                </section>;
            })}
        </nav>
    </div>;
}

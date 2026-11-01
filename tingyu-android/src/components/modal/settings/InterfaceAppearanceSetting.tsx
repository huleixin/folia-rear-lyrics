import React from 'react';
import {useTranslation} from 'react-i18next';
import {Monitor,Sun,Moon} from 'lucide-react';
import {useThemeSettingsStore} from '../../../stores/useThemeSettingsStore';
import {isAndroidNativeRuntime} from '../../../utils/platform';
import type {InterfaceAppearance} from '../../../services/interfaceAppearance';

// src/components/modal/settings/InterfaceAppearanceSetting.tsx
const choices = [['system','interfaceAppearanceSystem',Monitor],['light','interfaceAppearanceLight',Sun],['dark','interfaceAppearanceDark',Moon]] as const;
export default function InterfaceAppearanceSetting(){
    const {t}=useTranslation();
    const mode=useThemeSettingsStore(state=>state.interfaceAppearance);
    if(!isAndroidNativeRuntime())return null;
    return <section className="ty-interface-setting ty-settings-card" aria-label={t('options.interfaceAppearanceTitle')}>
        <h3>{t('options.interfaceAppearanceTitle')}</h3><p>{t('options.interfaceAppearanceDescription')}</p>
        <div role="radiogroup" aria-label="外观模式" className="ty-interface-choices">
            {choices.map(([value,label,Icon])=><button key={value} type="button" role="radio" aria-checked={mode===value}
                onClick={()=>useThemeSettingsStore.getState().setInterfaceAppearance(value as InterfaceAppearance)}>
                <Icon size={18}/><span>{t('options.'+label)}</span>
            </button>)}
        </div>
    </section>;
}

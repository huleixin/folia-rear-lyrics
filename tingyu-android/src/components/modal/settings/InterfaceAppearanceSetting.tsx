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
    return <section className="ty-interface-setting ty-settings-card" aria-label={t('options.interfaceAppearanceTitle')} data-settings-style='{"border":true,"radius":14,"padding":[16,16,16,16]}' data-settings-layout="card">
        <h3 data-settings-style='{"font":15,"weight":650}' data-settings-layout="wrap">{t('options.interfaceAppearanceTitle')}</h3><p data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted","margin":[0,5,0,14]}'>{t('options.interfaceAppearanceDescription')}</p>
        <div role="radiogroup" aria-label="外观模式" className="ty-interface-choices" data-settings-layout="grid" data-settings-style='{"columns":3,"gap":6,"padding":[4,4,4,4],"radius":16,"border":true}'>
            {choices.map(([value,label,Icon])=><button key={value} type="button" role="radio" aria-checked={mode===value}
                onClick={()=>useThemeSettingsStore.getState().setInterfaceAppearance(value as InterfaceAppearance)} data-settings-layout="wrap" data-settings-style='{"minHeight":52,"padding":[3,9,3,9],"gap":6,"radius":12,"font":13,"center":true,"stackBelow":350}'>
                <Icon size={18}/><span data-settings-layout="wrap">{t('options.'+label)}</span>
            </button>)}
        </div>
    </section>;
}

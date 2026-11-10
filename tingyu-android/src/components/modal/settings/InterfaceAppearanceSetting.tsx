import React from 'react';
import {useTranslation} from 'react-i18next';
import {Monitor,Sun,Moon} from 'lucide-react';
import {useThemeSettingsStore} from '../../../stores/useThemeSettingsStore';
import {isAndroidNativeRuntime} from '../../../utils/platform';
import {interfaceThemes} from '../../../theme/interfaceThemes.generated';
import './interfaceThemeControls.css';
import type {InterfaceAppearance} from '../../../services/interfaceAppearance';

// src/components/modal/settings/InterfaceAppearanceSetting.tsx
const choices = [['system','interfaceAppearanceSystem',Monitor],['light','interfaceAppearanceLight',Sun],['dark','interfaceAppearanceDark',Moon]] as const;
export default function InterfaceAppearanceSetting(){
    const {t}=useTranslation();
    const style=useThemeSettingsStore(state=>state.interfaceTheme);
    const mode=useThemeSettingsStore(state=>state.interfaceAppearance);
    if(!isAndroidNativeRuntime())return null;
    return <section className="ty-interface-setting ty-settings-card" aria-label={t('options.interfaceAppearanceTitle')} data-settings-style='{"border":true,"radius":14,"padding":[16,16,16,16]}' data-settings-layout="card">
        <h3 data-settings-layout="wrap" data-settings-style='{"font":15,"weight":650}'>{t('options.interfaceThemeTitle')}</h3>
        <p data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted","margin":[0,5,0,14]}'>{t('options.interfaceThemeDescription')}</p>
        <div role="radiogroup" aria-label={t('options.interfaceThemeTitle')} className="ty-theme-choices" data-settings-layout="grid" data-settings-style='{"columns":2,"gap":10,"margin":[0,0,0,18]}'>
            {Object.values(interfaceThemes).map(theme=><button key={theme.id} type="button" role="radio" aria-checked={style===theme.id}
                aria-label={t('options.'+theme.labelKey,{defaultValue:theme.label})} onClick={()=>useThemeSettingsStore.getState().setInterfaceTheme(theme.id)}
                className="ty-theme-card" data-settings-layout="column" data-settings-style='{"padding":[10,10,10,10],"gap":8,"radius":12,"border":true,"font":13}'>
                <span className="ty-theme-samples" aria-hidden="true" data-settings-layout="row" data-settings-style='{"gap":6}'>
                    {(['light','dark'] as const).map(mode=>{
                        const palette=theme[mode].native;
                        const color=(key:keyof typeof palette)=>'#'+palette[key].hex.slice(2);
                        return <span key={mode} className="ty-theme-sample" style={{background:color('launch')}} data-settings-swatch={color('launch')}
                            data-settings-layout="column" data-settings-style='{"grow":true,"height":44,"padding":[8,8,8,8],"gap":6,"radius":8}'>
                            <span className="ty-theme-line" style={{background:color('ink')}} data-settings-swatch={color('ink')} data-settings-layout="spacer" data-settings-style='{"width":22,"height":4,"radius":2}'/>
                            <span className="ty-theme-line" style={{background:color('accent')}} data-settings-swatch={color('accent')} data-settings-layout="spacer" data-settings-style='{"width":28,"height":8,"radius":3}'/>
                        </span>;
                    })}
                </span>
                <span data-settings-layout="wrap">{t('options.'+theme.labelKey,{defaultValue:theme.label})}</span>
            </button>)}
        </div>
        <h3 data-settings-style='{"font":15,"weight":650}' data-settings-layout="wrap">{t('options.interfaceAppearanceTitle')}</h3><p data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted","margin":[0,5,0,14]}'>{t('options.interfaceAppearanceDescription')}</p>
        <div role="radiogroup" aria-label="外观模式" className="ty-interface-choices" data-settings-layout="grid" data-settings-style='{"columns":3,"gap":6,"padding":[4,4,4,4],"radius":16,"border":true}'>
            {choices.map(([value,label,Icon])=><button key={value} type="button" role="radio" aria-checked={mode===value}
                onClick={()=>useThemeSettingsStore.getState().setInterfaceAppearance(value as InterfaceAppearance)} data-settings-layout="wrap" data-settings-style='{"minHeight":52,"padding":[3,9,3,9],"gap":6,"radius":12,"font":13,"center":true,"stackBelow":350}'>
                <Icon size={18}/><span data-settings-layout="wrap">{t('options.'+label)}</span>
            </button>)}
        </div>
    </section>;
}

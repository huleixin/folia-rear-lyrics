import React from 'react';

// src/components/modal/settings/BravaisSettingsToggleRow.tsx
// 「Bravais 墙面」分组里一行开关（标题、说明、右侧的 switch）。分组里的几个开关（集合叠页边、信息条始终透明、
// 墙后画面的歌词 / 模糊）共用这一份外形；data 属性由调用方给（用例按它找开关）。

type BravaisSettingsToggleRowProps = {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    isDaylight: boolean;
    /** 开着时的底色（主题第二色）。 */
    onColor?: string;
    /** 顶部分隔线（分组里第一行之后的每一行都有）。 */
    divider?: boolean;
    dataAttribute?: string;
};

const BravaisSettingsToggleRow: React.FC<BravaisSettingsToggleRowProps> = ({
    label,
    description,
    checked,
    onChange,
    isDaylight,
    onColor,
    divider = true,
    dataAttribute,
}) => {
    const dividerColor = isDaylight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]';
    return (
        <div
            className={`flex items-center justify-between gap-4${divider ? ' border-t pt-4' : ''}`}
            style={divider ? { borderColor: dividerColor } : undefined}
         data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
            <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">{label}</div>
                <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">{description}</div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                {...(dataAttribute ? { [dataAttribute]: '' } : {})}
                onClick={() => onChange(!checked)}
                className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!checked ? toggleOffBackgroundClass : ''}`}
                style={{ backgroundColor: checked ? onColor || 'rgba(114, 119, 134, 1)' : undefined }}
             data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={checked ? onColor || 'rgba(114, 119, 134, 1)' : undefined}>
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
            </button>
        </div>
    );
};

export default BravaisSettingsToggleRow;

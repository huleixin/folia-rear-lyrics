import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsRow, { SettingsToggle } from '../modal/settings/SettingsRow';
import { TemperaRangeControl } from './tempera/TemperaSettingsControls';

// Mode controls reuse the semantic rows consumed by Compose settings.
export type SettingsGroupDef = { id: string; titleKey: string };
export const percent = (value: number) => Math.round(value * 100) + '%';
export const times = (value: number) => value.toFixed(2) + '×';
export function Group({ def, foot, children }: React.PropsWithChildren<{ def: SettingsGroupDef; foot?: string }>) {
    const { t } = useTranslation();
    return <section id={def.id} className="space-y-3 rounded-2xl border border-current/10" data-settings-layout="column" data-settings-style='{"gap":12,"radius":16,"border":true}'>
        <h3 className="px-4 pt-4 text-sm font-medium" data-settings-layout="wrap" data-settings-style='{"padding":[16,16,16,0],"font":14,"weight":500}'>{t(def.titleKey)}</h3>
        {children}{foot && <p className="px-4 pb-3 text-xs opacity-60" data-settings-layout="wrap">{foot}</p>}
    </section>;
}
export function Row({ label, note, children }: React.PropsWithChildren<{ label: string; note?: string }>) {
    return <SettingsRow title={label} description={note} dividerClass="border-current/10">{children}</SettingsRow>;
}
export function Segmented<T extends string>({ value, options, onChange, disabled }: {
    value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean;
}) {
    return <div className="flex flex-wrap gap-2" data-settings-layout="wrap" data-settings-style='{"gap":8}'>
        {options.map(option => <button type="button" key={option.value} disabled={disabled} aria-pressed={value === option.value}
            data-settings-layout="row" data-settings-style='{"minHeight":44,"radius":12,"border":true,"fill":true,"padding":[12,8,12,8],"font":12,"center":true}'
            onClick={() => onChange(option.value)} className="rounded-xl border border-current/20 px-3 py-2 text-xs disabled:opacity-40"
            style={{ backgroundColor: value === option.value ? 'var(--bg-secondary)' : 'transparent' }}>{option.label}</button>)}
    </div>;
}
export function SliderRow({ label, note, value, min, max, step, format, onChange, onDragStart, onDragEnd, disabled }: {
    label: string; note?: string; value: number; min: number; max: number; step?: number;
    format?: (value: number) => string; onChange: (value: number) => void; onDragStart?: () => void; onDragEnd?: () => void; disabled?: boolean;
}) {
    return <div className="px-4 py-3" data-settings-layout="column">
        {note && <p className="mb-2 text-xs opacity-60" data-settings-layout="wrap">{note}</p>}
        <TemperaRangeControl label={label} value={value} min={min} max={max} step={step} formatValue={format} disabled={disabled}
            onChange={onChange} rangeInputClass="w-full" onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}/>
    </div>;
}
export function ToggleRow({ label, note, checked, onChange, disabled }: { label: string; note?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
    return <SettingsRow title={label} description={note} dividerClass="border-current/10" control={
        <SettingsToggle checked={checked} onChange={() => onChange(!checked)} offClass="bg-current/20" disabled={disabled} ariaLabel={label}/>}/>;
}

export function Select<T extends string>({value, options, onChange}: {value: T; options: {value:T;label:string}[];onChange:(value:T)=>void}) {
    return <select className="rounded-xl bg-transparent p-2" value={value} onChange={event => onChange(event.target.value as T)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
}

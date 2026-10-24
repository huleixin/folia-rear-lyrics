import React from 'react';
import { useTranslation } from 'react-i18next';
import { TemperaRangeControl } from '../tempera/TemperaSettingsControls';

// src/components/visualizer/hanabi/HanabiPanelControls.tsx
// Adapt upstream's mode-specific controls to the current settings UI, without importing its new kit.
export type SettingsGroupDef = { id: string; titleKey: string };
export function Group({ def, children }: React.PropsWithChildren<{ def: SettingsGroupDef }>) {
    const { t } = useTranslation();
    return <section className="space-y-4 border-t border-white/10 pt-4" id={def.id}>
        <h3 className="text-xs font-semibold opacity-60">{t(def.titleKey)}</h3>{children}
    </section>;
}
export function Row({ label, note, children }: React.PropsWithChildren<{ label: string; note?: string }>) {
    return <div className="space-y-2"><div className="text-sm">{label}</div>
        {note && <p className="text-xs opacity-50">{note}</p>}{children}</div>;
}
export function Segmented<T extends string>({ value, options, onChange }: {
    value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
    return <div className="flex flex-wrap gap-2">{options.map(option => <button type="button"
        key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}
        className={`rounded-xl border px-3 py-2 text-xs ${value === option.value ? 'border-emerald-300/50 bg-emerald-300/15' : 'border-white/10'}`}>
        {option.label}</button>)}</div>;
}
export function SliderRow({ label, note, value, min, max, step, format, onChange, onDragStart, onDragEnd }: {
    label: string; note?: string; value: number; min: number; max: number; step?: number;
    format?: (value: number) => string; onChange: (value: number) => void; onDragStart?: () => void; onDragEnd?: () => void;
}) {
    return <div className="space-y-1"><TemperaRangeControl label={label} value={value} min={min} max={max} step={step}
        formatValue={format} onChange={onChange} rangeInputClass="w-full accent-emerald-300" onPointerDown={onDragStart}
        onPointerUp={onDragEnd} onPointerCancel={onDragEnd} />{note && <p className="text-xs opacity-50">{note}</p>}</div>;
}
export function ToggleRow({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange: (value: boolean) => void }) {
    return <label className="flex items-center justify-between gap-4"><span className="min-w-0 text-sm">{label}
        {note && <span className="block text-xs opacity-50">{note}</span>}</span>
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-emerald-300" checked={checked} onChange={event => onChange(event.target.checked)} /></label>;
}

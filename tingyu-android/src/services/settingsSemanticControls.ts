import type { NativeSettingsFlowNode, SettingsControl } from '../types/nativeSettingsDocument';
import type { PageActions } from '../types/nativePages';
import { bindSettingsControl } from './nativeSettingsActions';
import i18n from 'i18next';

// src/services/settingsSemanticControls.ts
// Translate form semantics, never browser coordinates, into the existing TySettings contract.
const ids = new WeakMap<Element, string>();
let sequence = 0;
export function settingId(element: Element) {
    let id = ids.get(element);
    if (!id) { id = `form:${++sequence}`; ids.set(element, id); }
    return id;
}
export const settingText = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
export const settingControlSelector = 'button,a[href],summary,input:not([type="hidden"]),textarea,select,[role="button"],[role="switch"],[role="checkbox"],[role="tab"],[role="option"],[data-native-ruler],[data-native-color],[data-native-order]';

/** Derive a label from accessible names and the nearest form row, without CSS or geometry. */
function labelFor(element: HTMLElement) {
    const explicit = element.getAttribute('aria-label') || element.getAttribute('title');
    if (explicit) return explicit;
    const labelled = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => settingText(document.getElementById(id))).filter(Boolean).join(' ');
    if (labelled) return labelled;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        const labels = [...(element.labels ?? [])].map(settingText).join(' ');
        if (labels) return labels;
    } else if (settingText(element)) return settingText(element);
    const row = element.closest('[data-settings-row]');
    if (row) return settingText(row.querySelector('[data-settings-title]'));
    let parent = element.parentElement;
    for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
        const copy = parent.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(`${settingControlSelector},svg,[data-native-live]`).forEach(node => node.remove());
        const text = settingText(copy.querySelector('[class*="font-medium"],[class*="font-semibold"],h4') ?? copy);
        if (text) return text;
    }
    return element.getAttribute('placeholder') || element.querySelector('svg')?.getAttribute('class')?.replace(/.*lucide-([\w-]+).*/, '$1') || '…';
}

export function semanticControl(element: HTMLElement, actions: PageActions): NativeSettingsFlowNode {
    const id = settingId(element), input = element as HTMLInputElement;
    const isInput = element.matches('input,textarea,select');
    const type = input.type;
    const color = element.hasAttribute('data-native-color') || type === 'color';
    const reorder = element.hasAttribute('data-native-order');
    const ruler = element.hasAttribute('data-native-ruler');
    const select = element.hasAttribute('data-native-select') || element instanceof HTMLSelectElement;
    const toggle = element.matches('[role="switch"],[role="checkbox"],input[type="checkbox"],input[type="radio"]')
        || (element.hasAttribute('aria-pressed') && !settingText(element) && element.classList.contains('w-12'));
    const kind: NativeSettingsFlowNode['kind'] = reorder ? 'reorder' : color ? 'color' : select ? 'select' : ruler || type === 'range' ? 'slider'
        : toggle ? element.matches('[role="checkbox"],input[type="checkbox"],input[type="radio"]') ? 'checkbox' : 'switch' : isInput && !['file', 'button', 'submit'].includes(type) ? 'input' : 'action';
    const value = color ? element.getAttribute('data-native-color') ?? input.value
        : select ? element.getAttribute('data-native-value') ?? input.value
        : ruler ? element.getAttribute('aria-valuenow') ?? '0'
        : toggle ? element.getAttribute('aria-checked') === 'mixed' ? 'mixed' : (isInput ? input.checked : element.getAttribute('aria-checked') === 'true' || element.getAttribute('aria-pressed') === 'true') ? '1' : '0'
        : isInput ? input.value : '';
    const number = (v: string | null | undefined, fallback: number) => v && Number.isFinite(Number(v)) ? Number(v) : fallback;
    let options: NativeSettingsFlowNode['options'];
    if (select) {
        if (element instanceof HTMLSelectElement) options = [...element.options].map(option => ({ value: option.value, label: option.label, disabled: option.disabled }));
        else { try { options = JSON.parse(element.getAttribute('data-native-options') ?? '[]'); } catch { options = []; } }
    }
    const disabled = element.matches(':disabled,[aria-disabled="true"]') || Boolean(element.closest('[inert],[data-settings-disabled="true"]'));
    const row = element.closest('[data-settings-row]');
    const node: NativeSettingsFlowNode = {
        id, kind, title: labelFor(element), value, disabled, options,
        hint: row ? [...row.querySelectorAll('[data-settings-description],[data-settings-note]')].map(settingText).filter(Boolean).join('\n') : undefined,
        min: number(ruler ? element.getAttribute('aria-valuemin') : input.min, 0),
        max: number(ruler ? element.getAttribute('aria-valuemax') : input.max, 100),
        step: number(input.step, ruler ? 1 : 0), unit: ruler ? ' ms' : '',
        placeholder: element.getAttribute('placeholder') ?? '', multiline: element instanceof HTMLTextAreaElement,
        inputType: type || 'text', immediate: kind === 'input',
        confirmLabel: String(i18n.t('ui.confirm', { defaultValue: '确定' })),
        detail: element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true' || element.matches('[role="radio"][aria-checked="true"]') ? '✓' : undefined,
    };
    if (color) node.options = ['hue', 'saturation', 'brightness'].map(value => ({ value, label: String(i18n.t(`nativeSettings.${value}`, { defaultValue: value })) }));
    if (reorder) {
        try { const order = JSON.parse(element.getAttribute('data-native-order') ?? '[]'); node.options = Array.isArray(order) ? order.map(value => ({ value: String(value), label: `.${value}` })) : []; } catch { node.options = []; }
        node.placeholder = String(i18n.t('nativeSettings.moveUp')); node.confirmLabel = String(i18n.t('nativeSettings.moveDown'));
    }
    // Keep native SAF, validation, React controlled inputs and asynchronous actions on their
    // original handlers. The adapter only normalizes native event names and scalar payloads.
    const control: SettingsControl = { id, kind: select ? 'select' : ruler ? 'ruler' : kind === 'slider' ? 'range' : kind === 'input' ? 'text' : 'click',
        label: node.title, disabled, value, x: 0, y: 0, w: 0, h: 0 };
    bindSettingsControl(element, control, actions);
    if (select) actions[`open:${id}`] = () => { if (!disabled && element.isConnected) element.click(); };
    const invoke = actions[id];
    if (kind === 'input') {
        actions[`focus:${id}`] = event => invoke?.({ value: event.value ? 3 : 4 });
        actions[`enter:${id}`] = () => invoke?.({ value: 5 });
    }
    const prefix = kind === 'switch' || kind === 'checkbox' || kind === 'select' ? 'set' : kind === 'slider' ? 'slide' : kind === 'input' ? 'submit' : 'act';
    actions[`${prefix}:${id}`] = event => {
        if (disabled || !element.isConnected) return;
        if (select && !node.options?.some(option => option.value === event.text && !option.disabled)) return;
        if (kind === 'slider' && (!Number.isFinite(event.value) || event.value! < node.min! || event.value! > node.max!)) return;
        if (reorder) { try { element.dispatchEvent(new CustomEvent('tingyu-native-order', { detail: JSON.parse(event.text ?? '[]') })); } catch { /* Invalid order packets never reach the store. */ } }
        else if (color && element.hasAttribute('data-native-color')) element.dispatchEvent(new CustomEvent('tingyu-native-color', { detail: event.text }));
        else if (color) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(element, event.text ?? ''); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            if (kind === 'slider' && !ruler) element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            invoke?.({ text: kind === 'slider' ? String(event.value) : event.text, value: kind === 'slider' ? 2 : event.value });
        }
    };
    return node;
}

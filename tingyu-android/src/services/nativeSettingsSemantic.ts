import type { NativeSettingsDocument, NativeSettingsFlow, NativeSettingsFlowNode } from '../types/nativeSettingsDocument';
import type { PageActions } from '../types/nativePages';
import { semanticControl, settingControlSelector, settingId, settingText } from './settingsSemanticControls';
import { bindSemanticPreview } from './settingsSemanticPreview';
import { absolutePageImage } from './nativePages';

// src/services/nativeSettingsSemantic.ts
// Shared settings state hosts expose semantic forms; Compose owns every row, scroll and modal.
// No getBoundingClientRect, Range, computed font, paint list or browser scroll offset is exported.
const excluded = 'script,style,svg,[hidden],[aria-hidden="true"],[data-native-decoration],input[type="hidden"]';
const visible = (element: HTMLElement) => !element.matches('[hidden],[aria-hidden="true"]') && getComputedStyle(element).display !== 'none';
const navigationButton = (element: Element) => element.matches('button') && Boolean(element.querySelector('svg.lucide-chevron-left,svg.lucide-arrow-left,svg.lucide-x'));

/** Capture the active editor and modal, retaining the original callbacks and current values. */
export function captureSemanticSettings(root: HTMLElement, key: string, fallbackTitle: string) {
    const actions: PageActions = {};
    const editors = [...root.querySelectorAll<HTMLElement>('[data-native-settings-editor], [data-front-stage-settings]')].filter(visible);
    const active = editors.at(-1) ?? root;
    const portals = [...document.querySelectorAll<HTMLElement>('[data-folia-themed-dialog],[role="dialog"][aria-modal="true"]')]
        .filter(node => node !== root && node !== active && !node.contains(active) && visible(node)
            && !node.matches('[data-folia-settings-panel]') && !node.parentElement?.closest('[data-folia-themed-dialog]'));
    const modal = portals.at(-1);
    const read = (source: HTMLElement, modalPage = false): NativeSettingsFlow => {
        const nodes: NativeSettingsFlowNode[] = [];
        const header = source.querySelector<HTMLElement>('[data-native-settings-header],header');
        const titleNode = header?.querySelector('h1,h2,[data-settings-page-title]') ?? source.querySelector('h1,h2');
        const title = settingText(titleNode) || source.getAttribute('aria-label') || fallbackTitle;
        const back = header?.querySelector<HTMLElement>('button') ?? [...source.querySelectorAll<HTMLElement>('button')].find(navigationButton);
        const backAction = modalPage ? 'dismiss' : 'back';
        if (back && navigationButton(back)) { const node = semanticControl(back, actions); actions[backAction] = actions[`act:${node.id}`]; }
        const visit = (element: HTMLElement) => {
            if (element.matches(excluded) || !visible(element) || element === modal && element !== source || (element !== source && element.matches('[data-folia-themed-dialog]'))) return;
            if (element === titleNode || element === back && navigationButton(element)) return;
            if (element instanceof HTMLLabelElement && element.control?.matches('input[type="checkbox"],input[type="radio"]')) {
                nodes.push(semanticControl(element.control as HTMLElement, actions));
                element.querySelectorAll<HTMLElement>(settingControlSelector).forEach(control => { if (control !== element.control) nodes.push(semanticControl(control, actions)); });
                return;
            }
            if (element.matches('[data-native-live="true"]')) {
                const id = settingId(element);
                bindSemanticPreview(element, id, actions);
                nodes.push({ id, kind: 'preview', title: '', min: element.hasAttribute('data-folia-stage-preview') ? 240 : 160 });
                // Preview pixels remain Folia; pause, section hotspots and any form controls
                // inside its old chrome are native rows too, never a second WebView UI.
                element.querySelectorAll<HTMLElement>(settingControlSelector).forEach(control => {
                    if (visible(control) && !control.closest(excluded)) nodes.push(semanticControl(control, actions));
                }); return;
            }
            if (element.matches(settingControlSelector) || element instanceof HTMLLabelElement && element.control?.matches('input[type="file"],input[type="checkbox"],input[type="radio"]')) {
                // File inputs are reached through their visible label/button and the existing SAF bridge.
                if (element.matches('input[type="file"]') && (element.hidden || getComputedStyle(element).display === 'none')) return;
                nodes.push(semanticControl(element, actions)); return;
            }
            if (element instanceof HTMLImageElement) {
                nodes.push({ id: settingId(element), kind: 'image', title: element.alt, value: absolutePageImage(element.currentSrc || element.src) }); return;
            }
            if (element.hasAttribute('data-settings-title')) return; // Carried by its form control.
            if (element.matches('h1,h2,h3,h4')) {
                const copy = element.cloneNode(true) as HTMLElement; copy.querySelectorAll(settingControlSelector).forEach(node => node.remove());
                if (settingText(copy)) nodes.push({ id: settingId(element), kind: 'group', title: settingText(copy) });
                element.querySelectorAll<HTMLElement>(settingControlSelector).forEach(control => nodes.push(semanticControl(control, actions))); return;
            }
            if (element.matches('[data-settings-description],[data-settings-note]')) return; // The native form row carries its hint.
            const summary = element instanceof HTMLDetailsElement && !element.open ? element.querySelector('summary') : null;
            if (summary) { visit(summary); return; }
            for (const child of element.childNodes) {
                if (child instanceof HTMLElement) visit(child);
                else if (child instanceof Text && child.data.trim()) nodes.push({ id: `${settingId(element)}:text:${nodes.length}`, kind: 'note', title: child.data.trim() });
            }
        };
        visit(source);
        return { key: `settings-flow:${key}${modalPage ? ':modal' : ''}`, title, nodes };
    };
    const flow = read(active);
    if (modal) { modal.dataset.nativeSettingsPortal = 'true'; modal.dataset.nativePage = 'true'; flow.modal = read(modal, true); }
    if (!actions.back) actions.back = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (!actions.dismiss) actions.dismiss = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { document: { paints: [], controls: [], areas: [], live: [], flow } satisfies NativeSettingsDocument, actions };
}

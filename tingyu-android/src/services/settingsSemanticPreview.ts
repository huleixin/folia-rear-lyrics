import type { PageActions } from '../types/nativePages';

// src/services/settingsSemanticPreview.ts
// Compose supplies the preview rectangle. Browser layout is never the source of native placement.
const priorStyles = new Map<HTMLElement, string | null>();
function previewVisibility(element:HTMLElement,visible:boolean){
    const value=String(visible);
    if(element.dataset.nativePreviewVisible===value)return;
    element.dataset.nativePreviewVisible=value;
    element.dispatchEvent(new CustomEvent('tingyu-preview-visibility',{bubbles:true,detail:visible}));
}
export function bindSemanticPreview(element: HTMLElement, id: string, actions: PageActions) {
    if (!priorStyles.has(element)) priorStyles.set(element, element.getAttribute('style'));
    element.dataset.nativePreview = id;
    for (let carrier = element.parentElement; carrier; carrier = carrier.parentElement) {
        carrier.dataset.nativeLiveCarrier = 'true';
        if (carrier.hasAttribute('data-native-document-root')) break;
    }
    actions[`preview:${id}`] = event => {
        if (!element.isConnected) return;
        try {
            const r = JSON.parse(event.text ?? '{}') as Record<string, number>;
            if (!['x', 'y', 'w', 'h', 'top', 'bottom'].every(key => Number.isFinite(r[key])) || r.w <= 0 || r.h <= 0 || r.w > 4000 || r.h > 4000) return;
            const visible=r.top+r.bottom<r.h;
            previewVisibility(element,visible);
            if(!visible){element.style.visibility='hidden';return;}
            Object.assign(element.style, { position: 'fixed', left: '0px', top: '0px', transform:`translate3d(${r.x}px, ${r.y}px, 0)`, visibility:'visible', width: `${r.w}px`, height: `${r.h}px`, minHeight: '0', margin: '0', zIndex: '1',
                borderRadius: '28px', overflow: 'hidden',
                clipPath: `inset(${Math.max(0, r.top)}px 0 ${Math.max(0, r.bottom)}px 0)` });
            element.dataset.nativePreviewReady = 'true';
            element.dataset.nativePreviewX=String(r.x);element.dataset.nativePreviewY=String(r.y);
        } catch { /* Ignore stale or malformed native layout packets. */ }
    };
    actions[`preview-tap:${id}`] = event => {
        try {
            const p = JSON.parse(event.text ?? '{}');
            if(element.dataset.nativePreviewVisible!=='true')return;
            const x = Number(element.dataset.nativePreviewX) + p.x, y = Number(element.dataset.nativePreviewY) + p.y;
            if (![x, y].every(Number.isFinite)) return;
            const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('button,a,[role="button"]');
            if (target && element.contains(target)) target.click();
        } catch { /* Ignore stale taps after leaving a preview. */ }
    };
}

export function clearSemanticPreviews() {
    document.querySelectorAll<HTMLElement>('[data-native-preview]').forEach(element => {
        delete element.dataset.nativePreview; delete element.dataset.nativePreviewReady;
        delete element.dataset.nativePreviewX;delete element.dataset.nativePreviewY;
        previewVisibility(element,true);delete element.dataset.nativePreviewVisible;
        const previous = priorStyles.get(element);
        if (previous == null) element.removeAttribute('style'); else element.setAttribute('style', previous);
    });
    priorStyles.clear();
    document.querySelectorAll<HTMLElement>('[data-native-live-carrier]').forEach(element => delete element.dataset.nativeLiveCarrier);
}

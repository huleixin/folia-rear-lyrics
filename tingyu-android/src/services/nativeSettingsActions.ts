import type { PageActions } from '../types/nativePages';
import type { SettingsControl } from '../types/nativeSettingsDocument';
import { isAndroidNativeRuntime } from '../utils/platform';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { pickNativeSettingsFiles } from './nativeSettingsFilePicker';

function activateSettingsClick(element: HTMLElement) {
    if (!isAndroidNativeRuntime() || document.documentElement.dataset.nativeSettingsDocument !== 'true') {
        element.click();
        return;
    }

    // A native-tapped <label> may activate its associated file input through browser default
    // behavior (without calling HTMLInputElement.click), so route that relation explicitly.
    const labeledInput = element instanceof HTMLLabelElement ? element.control : null;
    if (labeledInput instanceof HTMLInputElement && labeledInput.type === 'file') {
        void deliverNativeFiles(labeledInput);
        return;
    }

    // React upload buttons call input.click() synchronously. During this one synthetic button
    // activation, capture that target and replace the WebView picker with the native SAF bridge.
    // The chosen files are then delivered through the original input change handler.
    const prototype = HTMLInputElement.prototype;
    const originalClick = prototype.click;
    const captured: { fileInput: HTMLInputElement | null } = { fileInput: null };
    prototype.click = function(this: HTMLInputElement) {
        if (this.type === 'file') { captured.fileInput = this; return; }
        originalClick.call(this);
    };
    try { element.click(); }
    finally { prototype.click = originalClick; }
    if (!captured.fileInput) return;

    const target = captured.fileInput;
    void deliverNativeFiles(target);
}

function deliverNativeFiles(target: HTMLInputElement) {
    return pickNativeSettingsFiles(target).then(files => {
        if (!files?.length || !target.isConnected) return; // SAF cancellation is a no-op.
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        target.files = transfer.files;
        target.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage({ type: 'error', text: message, nonce: Date.now() });
    });
}

// src/services/nativeSettingsActions.ts
// Feed native edits through React's existing input handlers and validation/store actions.
export function bindSettingsControl(element:HTMLElement,control:SettingsControl,actions:PageActions){
    actions[control.id]=event=>{
        if(!element.isConnected||element.matches(':disabled,[aria-disabled="true"]'))return;
        const input=element as HTMLInputElement;
        if(event.value===3||event.value===4){element.dispatchEvent(new FocusEvent(event.value===3?'focusin':'focusout',{bubbles:true}));return;}
        if(event.value===5){element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));element.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));return;}
        if(control.kind==='pad'){
            try{const point=JSON.parse(event.text??'{}'),rect=element.getBoundingClientRect();
                const options={bubbles:true,buttons:event.value===2?0:1,clientX:rect.left+Math.max(0,Math.min(1,point.x))*rect.width,clientY:rect.top+Math.max(0,Math.min(1,point.y))*rect.height};
                if(event.value===1){element.dispatchEvent(new PointerEvent('pointerdown',options));element.dispatchEvent(new MouseEvent('mousedown',options));}
                else document.dispatchEvent(new MouseEvent(event.value===2?'mouseup':'mousemove',options));
            }catch{/* Ignore a stale pointer packet. */}return;
        }
        if(control.kind==='ruler'){element.dispatchEvent(new CustomEvent('tingyu-native-value',{detail:Number(event.text)}));return;}
        if(control.kind==='click'){
            // Custom-select outside/keyboard handlers must observe a real pointer sequence too.
            element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
            element.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
            activateSettingsClick(element);element.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return;
        }
        if(event.value===1)element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
        const prototype=element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value')?.set?.call(input,event.text??'');
        element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
        if(event.value===2){element.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));}
    };
}

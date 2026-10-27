import type { PageActions } from '../types/nativePages';
import type { SettingsControl } from '../types/nativeSettingsDocument';

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
            element.click();element.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return;
        }
        if(event.value===1)element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
        const prototype=element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value')?.set?.call(input,event.text??'');
        element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
        if(event.value===2){element.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));}
    };
}

import type { NativeSettingsDocument,SettingsRect,SettingsPaint,SettingsControl,SettingsScrollArea } from '../types/nativeSettingsDocument';
import type { PageActions } from '../types/nativePages';
import { absolutePageImage } from './nativePages';
import { settingsTextRuns } from './nativeSettingsText';
import { bindSettingsControl } from './nativeSettingsActions';
import { normalizeSettingsColors } from './nativeSettingsColor';

// src/services/nativeSettingsDocument.ts
// A measured display list preserves the existing settings design; Compose owns painting,
// scrolling, IME and native controls. No screenshot/HTML bitmap of the page is used.
const ids=new WeakMap<Element,string>();let next=0;
const idFor=(node:Element)=>{let id=ids.get(node);if(!id){id=`setting:${++next}`;ids.set(node,id)}return id};
const n=(value:string)=>parseFloat(value)||0;
const painted=(color:string)=>color&&color!=='transparent'&&!/^rgba\([^)]*,\s*0\s*\)$/.test(color);
export function captureSettingsDocument(root:HTMLElement){
    const base=root.getBoundingClientRect(),paints:SettingsPaint[]=[],controls:SettingsControl[]=[],areas:SettingsScrollArea[]=[],live:SettingsRect[]=[],actions:PageActions={};
    const rect=(box:DOMRect,area?:SettingsScrollArea):SettingsRect=>({x:box.left-base.left,y:box.top-base.top+(area?.offset??0),w:box.width,h:box.height});
    const visit=(element:Element,area?:SettingsScrollArea,opacity=1,clip?:SettingsRect)=>{
        if(!(element instanceof HTMLElement||element instanceof SVGElement)||element.matches('script,style,[hidden],input[type="hidden"]'))return;
        const style=getComputedStyle(element);if(style.display==='none')return;
        const box=rect(element.getBoundingClientRect(),area);if(!box.w||!box.h)return;
        // Visibility is deliberately hidden in the layout source, not in native output.
        const alpha=opacity*(element===root?1:Number(style.opacity));if(alpha<=0)return;
        const common={...box,area:area?.id,opacity:alpha,clip};
        if(element.matches('[data-native-live="true"]')){
            // Keep the original background chain behind a transparent live preview.
            // All other descendants remain individually hidden by the native document CSS.
            let carrier=element.parentElement;while(carrier){carrier.dataset.nativeLiveCarrier='true';if(carrier===root)break;carrier=carrier.parentElement;}
            live.push(rect(element.getBoundingClientRect()));paints.push({...common,kind:'live',radius:n(style.borderTopLeftRadius)});return;
        }
        const edges=[{width:n(style.borderTopWidth),color:style.borderTopColor},{width:n(style.borderRightWidth),color:style.borderRightColor},
            {width:n(style.borderBottomWidth),color:style.borderBottomColor},{width:n(style.borderLeftWidth),color:style.borderLeftColor}];
        if(painted(style.backgroundColor)||edges.some(edge=>edge.width>0)||style.backgroundImage.includes('gradient')){
            paints.push({...common,kind:'box',background:style.backgroundColor,gradient:style.backgroundImage,border:style.borderTopColor,borderWidth:n(style.borderTopWidth),radius:n(style.borderTopLeftRadius),edges});
        }
        if(element instanceof SVGSVGElement){
            // Resolve CSS/inherited colours before leaving the browser. Geometry stays vector,
            // including the illustration's own viewBox (it is not necessarily a 24px icon).
            const copy=element.cloneNode(true) as SVGSVGElement;
            const targets=[copy,...copy.querySelectorAll('*')];
            [element,...element.querySelectorAll('*')].forEach((source,index)=>{
                const target=targets[index],computed=getComputedStyle(source);
                for(const name of ['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-opacity','stroke-opacity','fill-rule']){
                    const value=computed.getPropertyValue(name);target.setAttribute(name,value==='currentcolor'?computed.color:value);
                }
                target.setAttribute('opacity',index===0?'1':computed.opacity);
            });
            paints.push({...common,kind:'svg',svg:new XMLSerializer().serializeToString(copy),color:style.color});return;
        }
        if(element instanceof HTMLImageElement){
            paints.push({...common,kind:'image',image:absolutePageImage(element.currentSrc||element.src),radius:n(style.borderTopLeftRadius)});return;
        }
        const input=element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement||element instanceof HTMLSelectElement;
        const clickable=element.matches('button,a[href],summary,[role="button"],[role="tab"],[role="option"],[role="switch"],[role="checkbox"]');
        const ruler=element.matches('[data-native-ruler]');
        const pad=element.matches('.react-colorful__interactive');
        if(input||clickable||ruler||pad){
            const node=element as HTMLInputElement;const type=node.type;
            const kind:SettingsControl['kind']=pad?'pad':ruler?'ruler':!input||type==='checkbox'||type==='radio'||type==='file'||type==='color'?'click':element instanceof HTMLSelectElement?'select':type==='range'?'range':'text';
            const control:SettingsControl={...box,id:idFor(element),kind,area:area?.id,disabled:element.matches(':disabled,[aria-disabled="true"]'),
                label:element.getAttribute('aria-label')||element.textContent?.trim()||element.getAttribute('placeholder')||'',value:ruler?element.getAttribute('aria-valuenow')??'0':type==='checkbox'||type==='radio'?(node.checked?'1':''):input?node.value:undefined,
                min:ruler?n(element.getAttribute('aria-valuemin')??'0'):n(node.min),max:ruler?n(element.getAttribute('aria-valuemax')??'100'):node.max?n(node.max):100,step:node.step==='any'?0:node.step?n(node.step):1,inputType:type,font:n(style.fontSize),color:style.color,
                multiline:element instanceof HTMLTextAreaElement,placeholder:element.getAttribute('placeholder')??'',accent:style.accentColor,rangeFill:style.appearance!=='none',
                padding:[n(style.paddingLeft),n(style.paddingTop),n(style.paddingRight),n(style.paddingBottom)],
                options:element instanceof HTMLSelectElement?[...element.options].map(option=>({value:option.value,label:option.text})):undefined};
            controls.push(control);bindSettingsControl(element as HTMLElement,control,actions);
            if(kind==='text'||kind==='range'||kind==='select')return;
        }
        let childArea=area;
        if(element instanceof HTMLElement&&/(auto|scroll)/.test(style.overflowY)&&element.scrollHeight>element.clientHeight+2){
            // Independent scroll panes (including third-level dialogs) retain their own offsets.
            const id=idFor(element),viewport=rect(element.getBoundingClientRect());
            childArea={...viewport,id,contentHeight:element.scrollHeight,offset:element.scrollTop};areas.push(childArea);
            actions[`scroll:${id}`]=event=>{element.scrollTop=Math.max(0,event.value??0);if(event.text!=='live')element.dispatchEvent(new Event('tingyu-native-form-scroll',{bubbles:true}))};
        }
        let childClip=childArea!==area?undefined:clip;
        if(childArea===area&&/(hidden|clip)/.test(style.overflow))childClip=box;
        const children=[...element.childNodes];
        // Positioned menus paint after normal siblings, like the original browser stacking order.
        children.sort((a,b)=>{const z=(node:Node)=>node instanceof Element?Number(getComputedStyle(node).zIndex)||0:0;return z(a)-z(b)});
        for(const child of children){
            if(child instanceof Text){
                const window=childArea&&childArea.contentHeight>4000?{top:childArea.y+childArea.offset-childArea.h*2,bottom:childArea.y+childArea.offset+childArea.h*3}:undefined;
                for(const run of settingsTextRuns(child,style,value=>rect(value,childArea),window))paints.push({...run,area:childArea?.id,opacity:alpha,clip:childClip});
            }
            else if(child instanceof Element)visit(child,childArea,alpha,childClip);
        }
    };
    // A third-level full-screen editor replaces the section underneath. Do not leave
    // its text fields interactive above the new editor or run two sets of form controls.
    const editors=[...root.querySelectorAll<HTMLElement>('.fixed,[role="dialog"]')].filter(node=>{
        const style=getComputedStyle(node),box=node.getBoundingClientRect();
        return style.display!=='none'&&style.position==='fixed'&&box.width>=base.width*.7&&box.height>=base.height*.5;
    }).sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
    visit(editors.at(-1)??root);
    // CustomSelect and confirmation dialogs use React portals. They belong to the same native document.
    const portalSelector='[data-folia-keyboard-window="true"],[role="listbox"],[role="dialog"]';
    const portals=[...document.querySelectorAll<HTMLElement>(portalSelector)]
        .filter(node=>node!==root&&!root.contains(node)&&!node.closest('[data-native-document-root]')&&!node.parentElement?.closest(portalSelector));
    for(const portal of portals){portal.dataset.nativeSettingsPortal='true';portal.dataset.nativePage='true';visit(portal);}
    actions.liveTap=event=>{try{const {x,y}=JSON.parse(event.text??'{}');const target=document.elementFromPoint(x+base.left,y+base.top);
        const button=target?.closest<HTMLElement>('button,a,[role="button"]');
        if(button&&button.closest('[data-native-live]'))button.click();}catch{/* Ignore stale/invalid pointer coordinates. */}};
    return {document:normalizeSettingsColors({paints,controls,areas,live} satisfies NativeSettingsDocument),actions};
}

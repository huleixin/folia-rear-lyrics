import type { SettingsLayoutNode, SettingsLayoutStyle } from '../types/settingsLayout';
import type { NativeSettingsFlowNode } from '../types/nativeSettingsDocument';
import type { PageActions } from '../types/nativePages';
import { settingId, semanticControl, settingControlSelector } from './settingsSemanticControls';
import { bindSemanticPreview } from './settingsSemanticPreview';
import { absolutePageImage } from './nativePages';

// src/services/settingsPageLayout.ts
// Preserve each page's declared cards/rows/grids and text roles. Undeclared wrappers
// are transparent; they cannot invent a card or convert a choice grid into a list.
const excluded='script,style,[hidden],[data-native-decoration]';
export function captureSettingsPageLayout(source:HTMLElement,nodes:NativeSettingsFlowNode[],actions:PageActions,skip:Element[]=[]):SettingsLayoutNode {
    let sequence=0;
    const excludedSet=new Set(skip);
    const styleOf=(element:Element):SettingsLayoutStyle=>{
        try{return JSON.parse(element.getAttribute('data-settings-style')??'{}')}catch{return {}}
    };
    const addControl=(element:HTMLElement,style:SettingsLayoutStyle):SettingsLayoutNode=>{
        let node=nodes.find(node=>node.id===settingId(element));
        if(!node){node=semanticControl(element,actions);nodes.push(node)}
        const content=node.kind==='action'?childrenOf(element):undefined;
        const kind=element.getAttribute('data-settings-layout')??'row';
        const children=content?.length?[{id:`content:${node.id}`,kind:kind as SettingsLayoutNode['kind'],style:{gap:style.gap,align:style.align,center:style.center,stackBelow:style.stackBelow},children:content}]:undefined;
        return {id:`layout:${node.id}`,kind:'control',ref:node.id,style,children,text:element.getAttribute('data-settings-swatch')??undefined};
    };
    const childrenOf=(element:Element):SettingsLayoutNode[]=>{
        const result:SettingsLayoutNode[]=[];let buffer='';
        const flush=()=>{const text=element.closest('pre,code')?buffer.trim():buffer.replace(/\s+/g,' ').trim();
            if(text)result.push({id:`copy:${++sequence}`,kind:'text',text});buffer='';};
        for(const child of element.childNodes){
            if(child instanceof Text)buffer+=child.data;
            else if(child instanceof Element){flush();result.push(...visit(child));}
        }
        flush();return result;
    };
    const visit=(element:Element):SettingsLayoutNode[]=>{
        if(excludedSet.has(element)||element.matches(excluded)||getComputedStyle(element).display==='none')return [];
        const id=settingId(element),style=styleOf(element);
        if(element.hasAttribute('data-settings-list')&&style.padding)style.padding=[0,...style.padding.slice(1)];
        if(element instanceof SVGSVGElement){
            if(element.hasAttribute('data-settings-art'))return [{id,kind:'vector',style,svg:element.outerHTML}];
            const icon=[...element.classList].find(value=>value.startsWith('lucide-')&&!value.endsWith('-icon'))?.slice(7);
            return icon?[{id,kind:'icon',icon,style:{width:Number(element.getAttribute('width'))||16,height:Number(element.getAttribute('height'))||16,...style}}]:[];
        }
        if(!(element instanceof HTMLElement))return [];
        if(element.tagName==='BR')return [{id,kind:'break'}];
        if(element.matches('[data-native-live="true"]')){
            if(!nodes.some(node=>node.id===id))nodes.push({id,kind:'preview',title:'',min:style.preview==='offset'?132:240});
            bindSemanticPreview(element,id,actions);
            const controls=[...element.querySelectorAll<HTMLElement>(settingControlSelector)].map(control=>addControl(control,{width:40,height:40,...styleOf(control),overlay:control.getAttribute('data-settings-overlay')??'pause'}));
            // Preview controls keep their original overlay placement, declared independently
            // from Folia's live pixels. The native renderer owns the surrounding layout.
            return [{id,kind:'control',ref:id,style,children:controls}];
        }
        if(element.matches(settingControlSelector))return [addControl(element,style)];
        if(element instanceof HTMLImageElement){
            if(!nodes.some(node=>node.id===id))nodes.push({id,kind:'image',title:element.alt,value:absolutePageImage(element.currentSrc||element.src)});
            return [{id,kind:'control',ref:id,style}];
        }
        if(element instanceof HTMLDetailsElement&&!element.open){const summary=element.querySelector('summary');return summary?visit(summary):[]}
        const children=childrenOf(element);
        if(element.tagName==='LI'&&element.parentElement?.hasAttribute('data-settings-list')){
            const list=element.parentElement;
            return [{id,kind:'row',style:{...style,gap:6},children:[
                {id:`${id}:marker`,kind:'text',text:list.getAttribute('data-settings-list')==='ordered'?`${[...list.children].indexOf(element)+1}.`:'•'},
                {id:`${id}:copy`,kind:'column',style:{grow:true},children},
            ]}];
        }
        const swatch=element.getAttribute('data-settings-swatch');
        if(!children.length)return swatch||style.grow||typeof style.progress==='number'?[{id,kind:'spacer',style,text:swatch??''}]:[];
        const kind=element.getAttribute('data-settings-layout') as SettingsLayoutNode['kind']|null;
        return kind?[{id,kind,style,children}]:children;
    };
    const body=source.querySelector<HTMLElement>('[data-settings-page-body]')??source;
    const children=(body!==source?[...source.querySelectorAll('[data-settings-toolbar]')].flatMap(visit):[]).concat(childrenOf(body));
    return {id:`page:${settingId(source)}`,kind:'column',style:{padding:[22,0,22,0],...styleOf(body)},children};
}

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { captureSettingsDocument } from '@/services/nativeSettingsDocument';

// test/unit/services/nativeSettingsDocument.test.ts
vi.mock('@/services/nativePages',()=>({absolutePageImage:(value:string)=>value}));
vi.mock('@/services/nativeSettingsColor',()=>({normalizeSettingsColors:(value:unknown)=>value}));
vi.mock('@/services/nativeSettingsText',()=>({settingsTextRuns:(node:Text,style:CSSStyleDeclaration)=>[{kind:'text',text:node.textContent,x:0,y:0,w:100,h:20,color:style.color,font:12}]}));
afterEach(()=>{vi.restoreAllMocks();document.body.replaceChildren()});
function fixture(){
    document.body.innerHTML='<main style="color:white"><details><summary>音源说明</summary><p>不应绘制的折叠正文</p><button>隐藏操作</button></details><button>启用</button></main>';
    // Closed details can retain child layout boxes in Chromium. Geometry alone does not
    // tell the native display-list bridge whether those descendants are actually painted.
    vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,300,80));
    const computed=window.getComputedStyle;
    vi.spyOn(window,'getComputedStyle').mockImplementation(node=>{
        const style=computed(node);if(!style.opacity)style.opacity='1';return style;
    });
    return document.querySelector('main')!;
}
it('draws only the summary of closed details, leaving following actions intact',()=>{
    const result=captureSettingsDocument(fixture()).document;
    expect(result.paints.filter(p=>p.kind==='text').map(p=>p.text)).toEqual(['音源说明','启用']);
    expect(result.controls.map(c=>c.label)).toEqual(['音源说明','启用']);
});
it('draws expanded content and removes it again after collapse',()=>{
    const root=fixture(),details=root.querySelector('details')!;details.open=true;
    expect(captureSettingsDocument(root).document.controls.map(c=>c.label)).toContain('隐藏操作');
    expect(captureSettingsDocument(root).document.paints.some(p=>p.kind==='text'&&p.text==='不应绘制的折叠正文')).toBe(true);
    details.open=false;
    expect(captureSettingsDocument(root).document.paints.some(p=>p.kind==='text'&&p.text==='不应绘制的折叠正文')).toBe(false);
});

it('isolates native input controls and scroll areas beneath a modal portal',()=>{
 const root=fixture();root.innerHTML='<input placeholder="例如: http://localhost:4533"><button>背景操作</button>';
 const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.innerHTML='<button>关闭音源</button>';
 document.body.append(modal);
 const result=captureSettingsDocument(root).document;
 expect(result.controls.map(c=>c.label)).toEqual(['关闭音源']);
 expect(result.controls.some(c=>c.placeholder?.includes('localhost'))).toBe(false);
 modal.remove();expect(captureSettingsDocument(root).document.controls.some(c=>c.placeholder?.includes('localhost'))).toBe(true);
});

it('captures contrast-safe light secondary text at full opacity for the native Canvas',()=>{
 const style=document.createElement('style');
 style.textContent=`html[data-interface-appearance='light'] [data-folia-settings-overlay] [data-folia-settings-content] p[style*="--text-secondary"]{color:#496357!important;opacity:1!important}`;
 document.head.append(style);document.documentElement.dataset.interfaceAppearance='light';
 const root=document.createElement('main');root.dataset.foliaSettingsOverlay='true';root.innerHTML='<div data-folia-settings-content><p style="--text-secondary:#496357;color:#536d61;opacity:.5">次级说明</p></div>';document.body.append(root);
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,300,80));
 const computed=window.getComputedStyle;
 vi.spyOn(window,'getComputedStyle').mockImplementation(node=>{
  const result=computed(node);if(!result.opacity)result.opacity='1';
  if(node instanceof HTMLElement&&node.tagName==='P'){
   Object.defineProperty(result,'color',{configurable:true,value:'rgb(73, 99, 87)'});
   Object.defineProperty(result,'opacity',{configurable:true,value:'1'});
  }
  return result;
 });
 const paint=captureSettingsDocument(root).document.paints.find(p=>p.kind==='text'&&p.text==='次级说明');
 expect(paint).toMatchObject({color:'rgb(73, 99, 87)',opacity:1});
});

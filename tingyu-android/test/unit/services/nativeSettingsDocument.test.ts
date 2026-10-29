// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { captureSettingsDocument } from '@/services/nativeSettingsDocument';

// test/unit/services/nativeSettingsDocument.test.ts
vi.mock('@/services/nativePages',()=>({absolutePageImage:(value:string)=>value}));
vi.mock('@/services/nativeSettingsColor',()=>({normalizeSettingsColors:(value:unknown)=>value}));
vi.mock('@/services/nativeSettingsText',()=>({settingsTextRuns:(node:Text)=>[{kind:'text',text:node.textContent,x:0,y:0,w:100,h:20,color:'#ffffff',font:12}]}));
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

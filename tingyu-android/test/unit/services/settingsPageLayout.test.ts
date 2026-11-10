// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { captureSemanticSettings } from '../../../src/services/nativeSettingsSemantic';
import type { SettingsLayoutNode } from '../../../src/types/settingsLayout';
import { readFileSync, readdirSync } from 'node:fs';

// test/unit/services/settingsPageLayout.test.ts
const all = (n: SettingsLayoutNode): SettingsLayoutNode[] => [n, ...(n.children ?? []).flatMap(all)];
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('preserves declared cards, horizontal copy/toggle and choice grids without reading rectangles', () => {
    document.body.innerHTML = `<main><header><button><svg class="lucide-chevron-left"></svg></button><h1>播放控制</h1><button aria-label="帮助">?</button></header>
      <section data-settings-page-body data-settings-style='{"padding":[22,0,22,0]}'>
      <div data-settings-layout="card"><div data-settings-layout="row" data-settings-style='{"align":"between","gap":16}'>
      <div data-settings-layout="column" data-settings-style='{"grow":true}'><strong>播放行为</strong><p>说明保持在开关左侧</p></div>
      <button role="switch" aria-label="播放行为" aria-checked="true"></button></div>
      <div data-settings-layout="grid" data-settings-style='{"columns":2,"gap":8}'><button>追加到末尾</button><button>追加到下一首</button></div></div></section></main>`;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => { throw Error('geometry forbidden'); });
    const { document: doc } = captureSemanticSettings(document.querySelector('main')!, 'playback', '设置');
    const tree = all(doc.flow!.layout!);
    expect(tree.filter(n => n.kind === 'card')).toHaveLength(1);
    expect(tree.find(n => n.kind === 'row')?.children?.map(n => n.kind)).toEqual(['column', 'control']);
    expect(tree.find(n => n.kind === 'grid')).toMatchObject({ style: { columns: 2, gap: 8 }, children: [{ kind: 'control' }, { kind: 'control' }] });
    expect(tree.filter(n => n.kind === 'text').map(n => n.text)).not.toContain('播放控制');
    expect(doc.flow!.headerActions).toHaveLength(1);
    expect(doc.paints).toEqual([]); expect(doc.controls).toEqual([]);
});
it('keeps preview pause/hotspots as overlays and never serializes renderer pixels or lyrics', () => {
    document.body.innerHTML = `<main><section data-settings-page-body><div data-native-live="true" data-settings-style='{"preview":"stage"}'>
      <span>动态歌词正文不得进入布局包</span><button data-settings-overlay="background">背景</button><button data-settings-overlay="pause">暂停预览</button></div></section></main>`;
    const flow = captureSemanticSettings(document.querySelector('main')!, 'editor', '舞台').document.flow!;
    expect(flow.layout!.children![0]).toMatchObject({ kind: 'control', style: { preview: 'stage' }, children: [
        { style: { overlay: 'background' } }, { style: { overlay: 'pause' } },
    ] });
    expect(JSON.stringify(flow.layout)).not.toContain('动态歌词正文');
});
it('keeps native color dimensions and multiline diagnostic text', () => {
    document.body.innerHTML = `<main><section data-settings-page-body><pre>第一行\n第二行</pre><div data-native-color="#123456" data-native-visible-hue="true" data-settings-style='{"height":180}'></div></section></main>`;
    const flow = captureSemanticSettings(document.querySelector('main')!, 'theme', '主题').document.flow!;
    expect(all(flow.layout!).find(n => n.kind === 'text')?.text).toBe('第一行\n第二行');
    expect(flow.nodes.find(n => n.kind === 'color')).toMatchObject({ value: '#123456', detail: 'visible-hue' });
    expect(all(flow.layout!).find(n => n.kind === 'control')?.style?.height).toBe(180);
});

it('joins React text fragments without stacking a version number or losing explicit breaks', () => {
    const root=document.createElement('main');
    root.dataset.settingsLayout='wrap'; document.body.append(root);
    root.append('听屿 ', '1.3.190', ' · Folia', document.createElement('br'), '下载与源码');
    const nodes=all(captureSemanticSettings(root,'about','关于').document.flow!.layout!);
    expect(nodes.filter(n=>n.kind==='text').map(n=>n.text)).toEqual(['听屿 1.3.190 · Folia','下载与源码']);
    expect(nodes.filter(n=>n.kind==='break')).toHaveLength(1);
});

it('ships native geometry for every icon in the real route fixtures, including Lucide renames', () => {
    const icons=JSON.parse(readFileSync('android/app/src/main/res/raw/native_page_icons.json','utf8'));
    for(const file of readdirSync('android/app/src/test/resources/settings-layout')){
        const flow=JSON.parse(readFileSync(`android/app/src/test/resources/settings-layout/${file}`,'utf8'));
        for(const layout of [flow.layout,flow.modal?.layout].filter(Boolean))
            for(const node of all(layout))if(node.kind==='icon')expect(icons[node.icon!],`${file}: ${node.icon}`).toBeTruthy();
        for(const id of flow.headerActions??[]){const icon=flow.nodes.find((n:{id:string})=>n.id===id)?.icon;if(icon)expect(icons[icon],icon).toBeTruthy();}
    }
});

it('lets the existing native dialog frame own its padding without nesting a second frame',()=>{
    document.body.innerHTML=`<main><button>父页</button></main><div data-folia-themed-dialog data-settings-style='{"padding":[24,24,24,24],"border":true}'><h2>确认删除</h2><button>取消</button><button>删除</button></div>`;
    const modal=captureSemanticSettings(document.querySelector('main')!,'test','设置').document.flow!.modal!;
    expect(modal.layout!.style).toEqual({gap:undefined,padding:[0,0,0,0]});
});

it('keeps the existing small choice illustration as an explicit vector asset without page geometry',()=>{
    document.body.innerHTML=`<main><svg data-settings-art data-settings-style='{"aspect":1.6}' viewBox="0 0 160 100"><path d="M0 0L10 10"/></svg><svg><path d="M0 0L3 3"/></svg></main>`;
    const tree=all(captureSemanticSettings(document.querySelector('main')!,'general','界面').document.flow!.layout!);
    expect(tree.filter(n=>n.kind==='vector')).toHaveLength(1);
    expect(tree.find(n=>n.kind==='vector')).toMatchObject({style:{aspect:1.6},svg:expect.stringContaining('viewBox="0 0 160 100"')});
});
it('presents a settings filter menu natively and preserves the original menu handlers',()=>{
    vi.stubGlobal('PointerEvent',MouseEvent);
    document.body.innerHTML='<main><button>Level</button></main><div role="menu" aria-label="Level"><button>error</button></div>';
    const click=vi.fn();document.querySelector('[role="menu"] button')!.addEventListener('click',click);
    const result=captureSemanticSettings(document.querySelector('main')!,'developer','开发者');
    expect(result.document.flow!.modal!.title).toBe('Level');
    result.actions[`act:${result.document.flow!.modal!.nodes[0].id}`]({});expect(click).toHaveBeenCalledOnce();
});

// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { nativeShellRoute, nativeShellHasWebOverlay } from '@/utils/nativeShellState';
import { pageRowActions } from '@/utils/nativePageActions';

// test/unit/utils/nativeShellState.test.ts
const home={settingsOpen:false,settingsIndex:true,searchOpen:false,collectionOpen:false,view:'home',libraryPage:'home'};
it('routes immediately from store state, without a painted-page acknowledgement',()=>{
    expect(nativeShellRoute(home)).toEqual({route:'home',selectedTab:0});
    expect(nativeShellRoute({...home,view:'player'}).route).toBe('stage');
    expect(nativeShellRoute({...home,searchOpen:true,collectionOpen:true}).route).toBe('collection');
    expect(nativeShellRoute({...home,settingsOpen:true,searchOpen:true,collectionOpen:true}).route).toBe('settings');
    expect(nativeShellRoute({...home,settingsOpen:true,settingsIndex:false}).route).toBe('web');
    expect(nativeShellRoute({...home,libraryPage:'library'})).toEqual({route:'home',selectedTab:1});
});
it('keeps native pages behind HTML dialogs and ignores the small stage menu',()=>{
    const page=document.createElement('div');page.dataset.nativePage='true';
    const wrapper=document.createElement('div');wrapper.append(page);
    const menu=document.createElement('div');menu.dataset.nativeChromeOverlay='nonblocking';
    expect(nativeShellHasWebOverlay([page,wrapper,menu])).toBe(false);
    expect(nativeShellHasWebOverlay([page,document.createElement('div')])).toBe(true);
});
it('resolves cached rows against current identities instead of old callback snapshots',()=>{
    let rows=['one','two'];const calls:string[]=[];
    const actions=pageRowActions({back:()=>calls.push('back')},id=>{
        const [index,key]=id.split(':');return rows[Number(index)]===key?()=>calls.push(key):undefined;
    });
    actions['0:one']({});actions.back({});
    rows=['two','one'];expect(actions['0:one']).toBeUndefined();actions['0:two']({});
    expect(calls).toEqual(['one','back','two']);
});

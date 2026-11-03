// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import MinimalArtistLink from '@/components/app/overlays/minimal-stage/MinimalArtistLink';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { SongResult } from '@/types';

// test/unit/minimalArtistLink.test.ts
vi.mock('@/services/onlineMusic/catalogRefs', () => ({canResolveSongCatalogRef: () => true}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const mount = (artists: SongResult['artists']) => {
    usePlaybackStore.setState({currentSong:{id: 'song', name:'Track', artists} as SongResult});
    const node = document.createElement('div'); document.body.append(node);
    const root = createRoot(node); const open = vi.fn();
    act(() => root.render(React.createElement(MinimalArtistLink, {label:'Artist',className:'artist',onOpen:open})));
    return {node,root,open,close:()=>{act(()=>root.unmount());node.remove();}};
};
afterEach(()=>usePlaybackStore.setState({currentSong:null}));
it('opens the selected artist identity, separately for multiple artists',()=>{
    const artists=[{id:'a',name:'A'},{id:'b',name:'B',entityId:'entity-b'}];
    const view=mount(artists);
    try {
        const buttons=view.node.querySelectorAll('button'); expect(buttons.length).toBe(2);
        act(()=>buttons[1].click()); expect(view.open).toHaveBeenCalledExactlyOnceWith(artists[1]);
    } finally {view.close();}
});
it('does not advertise a link for display-only artist metadata',()=>{
    const view=mount([{name:'Display only'} as SongResult['artists'][number]]);
    try {expect(view.node.querySelector('button')).toBeNull();expect(view.node.querySelector('svg')).toBeNull();}
    finally {view.close();}
});
it('keeps the presented artist while the live player has already switched songs',()=>{
    const view=mount([{id:'new',name:'New artist'}]);
    try {
        act(()=>view.root.render(React.createElement(MinimalArtistLink,{label:'Old artist',className:'artist',track:{id:'old-song',name:'Old',artists:[{id:'old',name:'Old artist'}]} as SongResult})));
        expect(view.node.textContent).toBe('Old artist');expect(view.node.querySelector('button')).toBeNull();
    }finally{view.close();}
});

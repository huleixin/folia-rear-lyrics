// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {hasBlockingChromeWindow} from '../../../src/services/nativeChrome';
// Invisible retained dialogs cannot disable a visible native mini player.
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();});
describe('native chrome overlay ownership',()=>{
    it('ignores a dialog hidden by an ancestor, but blocks when actually visible',()=>{
        document.body.innerHTML='<div id="host" hidden><div data-folia-keyboard-window="true"></div></div>';
        const dialog=document.querySelector<HTMLElement>('[data-folia-keyboard-window]')!;
        vi.spyOn(dialog,'getClientRects').mockReturnValue([{width:200,height:100}] as unknown as DOMRectList);
        expect(hasBlockingChromeWindow()).toBe(false);
        document.getElementById('host')!.hidden=false;
        expect(hasBlockingChromeWindow()).toBe(true);
        document.getElementById('host')!.style.display='none';
        expect(hasBlockingChromeWindow()).toBe(false);
    });
    it('excludes the native settings host and nonblocking menus',()=>{
        document.body.innerHTML='<div data-folia-settings-overlay><div data-folia-keyboard-window="true"></div></div><div data-folia-keyboard-window="true" data-native-chrome-overlay="nonblocking"></div>';
        expect(hasBlockingChromeWindow()).toBe(false);
    });
});

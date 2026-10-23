// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMobileFooterMotion } from '@/library/suites/mobile/mobileFooterMotion';

// test/unit/library/mobileFooterMotion.test.ts
// Native animation lifecycle tests; these do not measure actual WebView frame pacing or pixels.
type Call = { node: HTMLElement; frames: Keyframe[]; options: KeyframeAnimationOptions; animation: Animation; finish: () => void };
let footer: HTMLElement, mini: HTMLElement, nav: HTMLElement;
let runtime: ReturnType<typeof createMobileFooterMotion>;
let calls: Call[], current: Map<Element, { transform: string; opacity?: string }>, navHeight: number;
beforeEach(() => {
    footer = document.createElement('footer'); mini = document.createElement('div'); nav = document.createElement('nav');
    footer.style.rowGap = '6px'; mini.style.width = '360px'; mini.style.height = '46px'; navHeight = 54;
    footer.append(mini, nav); document.body.append(footer); calls = []; current = new Map();
    vi.spyOn(nav, 'getBoundingClientRect').mockImplementation(() => ({ height: navHeight } as DOMRect));
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(node => current.get(node) as CSSStyleDeclaration ?? computed(node));
    for (const node of [mini, nav]) {
        node.animate = vi.fn((frames, options) => {
            const animation = { onfinish: null, cancel: vi.fn() } as unknown as Animation;
            calls.push({ node, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, animation,
                finish: () => animation.onfinish?.call(animation, {} as AnimationPlaybackEvent) });
            return animation;
        });
    }
    runtime = createMobileFooterMotion(footer, mini, nav);
});
afterEach(() => { runtime.destroy(); footer.remove(); vi.restoreAllMocks(); });
const last = (node: HTMLElement) => calls.filter(call => call.node === node).at(-1)!;

describe('persistent mini-player and navigation transition', () => {
    it('snaps the initial route and then translates the original mini without scaling or fading it', () => {
        runtime.update(false, false); expect(calls).toHaveLength(0);
        runtime.update(true, false);
        expect(last(mini).options).toMatchObject({ duration: 240, delay: 40, fill: 'both' });
        expect(last(mini).frames[1]).toEqual({ transform: 'translateY(60px)' });
        expect(last(nav).options).toMatchObject({ duration: 120, delay: 0 });
        expect(last(nav).frames[1]).toEqual({ transform: 'translateY(8px)', opacity: '0' });
        last(nav).finish(); last(mini).finish();
        expect(mini.style.transform).toBe('translateY(60px)'); expect(mini.style.opacity).toBe('');
        expect(mini.style.width).toBe('360px'); expect(mini.style.height).toBe('46px');
        expect(nav.style.visibility).toBe('hidden'); expect(footer.children).toHaveLength(2);
    });
    it('moves back up immediately and fades navigation in near the end of the 280ms return', () => {
        runtime.update(true, false); expect(calls).toHaveLength(0);
        runtime.update(false, false);
        expect(last(mini).options).toMatchObject({ duration: 280, delay: 0 });
        expect(last(nav).options).toMatchObject({ duration: 120, delay: 160 });
        expect(nav.style.visibility).toBe('visible');
        last(nav).finish(); last(mini).finish();
        expect(nav.style.opacity).toBe('1'); expect(mini.style.transform).toBe('translateY(0px)');
    });
    it('continues rapid reversals from the current composited pose and ignores stale completion callbacks', () => {
        runtime.update(false, false); runtime.update(true, false);
        const oldMini = last(mini), oldNav = last(nav), stale = oldNav.animation.onfinish!;
        current.set(mini, { transform: 'matrix(1, 0, 0, 1, 0, 24)' });
        current.set(nav, { transform: 'matrix(1, 0, 0, 1, 0, 3)', opacity: '.4' });
        runtime.update(false, false);
        expect(oldMini.animation.cancel).toHaveBeenCalledOnce();
        expect(last(mini).frames[0].transform).toBe('matrix(1, 0, 0, 1, 0, 24)');
        expect(last(nav).frames[0].opacity).toBe('.4'); expect(last(nav).options.delay).toBe(0);
        stale.call(oldNav.animation, {} as AnimationPlaybackEvent);
        expect(nav.style.visibility).toBe('visible');
        last(mini).finish(); last(nav).finish();
        expect(mini.style.transform).toBe('translateY(0px)'); expect(nav.style.opacity).toBe('1');
    });
    it('uses immediate placement and only a short fade when reduced motion is active', () => {
        runtime.update(false, false); runtime.update(true, true);
        expect(calls.filter(call => call.node === mini)).toHaveLength(0);
        expect(mini.style.transform).toBe('translateY(60px)');
        expect(last(nav).options).toMatchObject({ duration: 60, delay: 0 });
        expect(last(nav).frames[1].transform).toBe('translateY(0px)');
    });
    it('remeasures the actual nav height and ignores redundant resize notifications', () => {
        runtime.update(true, false); runtime.resize(); expect(calls).toHaveLength(0);
        navHeight = 70; runtime.resize();
        expect(last(mini).frames[1].transform).toBe('translateY(76px)');
        const count = calls.length; runtime.resize(); expect(calls).toHaveLength(count);
    });
    it('settles safely without WAAPI and cleans up active animation effects without changing glass properties', () => {
        nav.style.backdropFilter = 'url(#original-glass)';
        runtime.update(false, false); runtime.update(true, false);
        const pending = [...calls]; runtime.destroy();
        for (const call of pending) expect(call.animation.cancel).toHaveBeenCalledOnce();
        expect(mini.style.transform).toBe(''); expect(nav.style.opacity).toBe('');
        expect(nav.style.backdropFilter).toBe('url(#original-glass)');
        mini.animate = undefined as unknown as typeof mini.animate; nav.animate = undefined as unknown as typeof nav.animate;
        runtime = createMobileFooterMotion(footer, mini, nav);
        runtime.update(false, false); runtime.update(true, false);
        expect(mini.style.transform).toBe('translateY(60px)'); expect(nav.style.visibility).toBe('hidden');
    });
});

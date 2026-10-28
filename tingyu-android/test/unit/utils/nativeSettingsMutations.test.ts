// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { isVisualOnlyStyleMutation as ignore } from '@/utils/nativeSettingsMutations';

// test/unit/utils/nativeSettingsMutations.test.ts
it('ignores motion-frame edits but retains layout, theme and visibility changes', () => {
    expect(ignore('color:red; transform:translateX(10px)', 'transform:translateX(0px);color:red;will-change:transform')).toBe(true);
    expect(ignore('opacity:.4', 'opacity:1')).toBe(true);
    expect(ignore('opacity:1', 'opacity:0')).toBe(false);
    expect(ignore('height:10px', 'height:20px')).toBe(false);
    expect(ignore('color:red', 'color:blue')).toBe(false);
    expect(ignore('display:none', 'display:block')).toBe(false);
    expect(ignore('--accent:red', '--accent:blue')).toBe(false);
    expect(ignore('color:red', 'color:red !important')).toBe(false);
});

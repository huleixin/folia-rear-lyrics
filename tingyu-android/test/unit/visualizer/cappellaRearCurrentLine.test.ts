import { afterEach, expect, it, vi } from 'vitest';
import { getVisibleMessages } from '../../../src/components/visualizer/cappella/cappellaMessageLayout';
import type { CappellaIntensityConfig, CappellaMessage } from '../../../src/components/visualizer/cappella/cappellaTypes';
import type { Line, Theme } from '../../../src/types';

// test/unit/visualizer/cappellaRearCurrentLine.test.ts
afterEach(() => vi.unstubAllGlobals());
it('shows the current rear lyric instead of the final lyric in the song', () => {
    vi.stubGlobal('document', { documentElement: { dataset: { foliaSurface: 'rear-lyrics-panel' }, clientWidth: 347, clientHeight: 212 } });
    const messages: CappellaMessage[] = [0, 1, 2].map(index => ({ id: String(index), kind: 'lyric',
        lineIndex: index, side: 'left', avatarIndex: 0,
        line: { fullText: ['上一句', '正在唱', '还没有唱'][index], startTime: index * 10, endTime: index * 10 + 8, words: [] } as Line }));
    const result = getVisibleMessages(messages, 1, 212, 1, 12, {} as CappellaIntensityConfig['motion'], {} as Theme, 18, 220);
    expect(result.map(message => message.id)).toEqual(['1']);
});

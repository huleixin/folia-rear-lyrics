import { describe, expect, it } from 'vitest';
import { compressConfig, decompressConfig } from '@/utils/appearanceCodec';
import { buildImportPlan } from '@/utils/appearanceImportPlan';

// Style is shareable visual configuration; first-experience acknowledgement is device-local.
describe('player style appearance integration', () => {
    it.each(['classic', 'immersive'])('round trips %s without introduction state', style => {
        const result = decompressConfig(compressConfig({ playerStyle: style, playerStyleIntroAcknowledged: true }));
        expect(result.playerStyle).toBe(style); expect(result.playerStyleIntroAcknowledged).toBeUndefined();
    });
    it('omits invalid exported styles, rejects invalid imports and preserves old configs', () => {
        expect(decompressConfig(compressConfig({ playerStyle: 'future' })).playerStyle).toBeUndefined();
        expect(() => decompressConfig('{"playerStyle":"future"}')).toThrow('Invalid player style');
        expect(decompressConfig('{"theme":"dark"}').playerStyle).toBeUndefined();
    });
    it('shows a style change in the visual import preview', () => {
        const plan = buildImportPlan({ incoming: { playerStyle: 'immersive' }, current: { playerStyle: 'classic' },
            switches: { isCustomThemePreferred: false, songThemeAutoSwitchEnabled: false, songThemeAutoGenerateEnabled: false },
            isCustomThemeActive: true });
        expect(plan.changes).toContainEqual(expect.objectContaining({ key: 'playerStyle', group: 'visualizer', from: 'classic', to: 'immersive' }));
    });
});

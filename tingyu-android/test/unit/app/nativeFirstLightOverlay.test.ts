import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appearanceCss = fs.readFileSync(path.join(process.cwd(), 'src/styles/interfaceAppearance.css'), 'utf8');

describe('light appearance over native-first Compose pages', () => {
    it('does not paint an opaque WebView shell over the native page', () => {
        expect(appearanceCss).toMatch(
            /html\[data-interface-appearance='light'\]:not\(\[data-native-first='true'\]\)\s+\[data-folia-app-shell\]\[data-folia-android='true'\]:not\(\[data-folia-player-view\]\)\s*\{background:#f4f5ee!important\}/,
        );
        expect(appearanceCss).toMatch(
            /html\[data-interface-appearance='light'\]\[data-native-first='true'\]:is\(\[data-native-route='home'\],\[data-native-route='collection'\],\[data-native-route='search'\],\[data-native-route='settings'\]\)\s+\[data-folia-app-shell\]\[data-folia-android='true'\]:not\(\[data-folia-player-view\]\)\s*\{background:transparent!important\}/,
        );
    });

    it('keeps the outer scrim light but queue and dialog surfaces nearly opaque', () => {
        const queueCss = fs.readFileSync(path.join(process.cwd(), 'src/components/app/player-panel/mobileQueueSheet.css'), 'utf8');
        expect(queueCss).toMatch(/\.mobile-queue-scrim\[data-interface-light='true'\] .mobile-queue-sheet\s*\{\s*color:#213e34!important; background:rgba\(244,247,241,\.97\)!important;/);
        expect(appearanceCss).toMatch(/\[data-folia-themed-dialog\]\{background:rgba\(241,244,237,\.97\)!important/);
        expect(appearanceCss).toMatch(/\[data-folia-themed-overlay\]\{background:rgba\(14,35,25,\.10\)!important/);
    });
});

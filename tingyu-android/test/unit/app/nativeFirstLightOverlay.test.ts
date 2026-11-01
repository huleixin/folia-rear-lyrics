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
});

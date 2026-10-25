import type { LyricUnit } from './dioramaSceneTypes';
import { measureDioramaText } from './dioramaTextRaster';
import { LINE_FONT_SIZE } from './dioramaSceneConstants';

// src/components/visualizer/diorama/dioramaRearTextLayout.ts
// Wrap at existing timed-unit boundaries, preserving word timing, spacing and kerning within each row.
export function layoutDioramaRearText(text: string, units: readonly LyricUnit[], font: string, maxWidth: number) {
    const fullWidth = measureDioramaText(text, font);
    const rowCount = Math.max(1, Math.ceil(fullWidth / maxWidth));
    const longestUnit = Math.max(0, ...units.map((unit) => measureDioramaText(unit.text, font)));
    // Balance short multi-row sentences instead of leaving a lone final character.
    const rowWidth = Math.min(maxWidth, Math.max(longestUnit, (fullWidth / rowCount) * 1.08));
    const buildRows = (limit: number) => {
        const rows: Array<{ first: number; last: number; start: number; width: number }> = [];
        let first = 0;
        const pushRow = (last: number) => {
            const start = units[first].charStart;
            rows.push({ first, last, start, width: measureDioramaText(text.slice(start, units[last].charEnd), font) });
            first = last + 1;
        };
        for (let index = 0; index < units.length; index++) {
            if (
                index > first &&
                measureDioramaText(text.slice(units[first].charStart, units[index].charEnd), font) > limit
            ) {
                pushRow(index - 1);
            }
        }
        if (first < units.length) pushRow(units.length - 1);
        return rows;
    };
    const balanced = buildRows(rowWidth),
        natural = buildRows(maxWidth);
    const rows = balanced.length > natural.length ? natural : balanced;
    return {
        rows,
        positions: units.map((unit, index) => {
            const rowIndex = rows.findIndex((row) => index >= row.first && index <= row.last);
            const row = rows[rowIndex];
            return {
                prefixPx: measureDioramaText(text.slice(row.start, unit.charStart), font),
                widthPx: row.width,
                centerY: ((rows.length - 1) / 2 - rowIndex) * LINE_FONT_SIZE * 1.4,
            };
        }),
    };
}

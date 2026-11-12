import {it,expect} from 'vitest';
import {rearLyricsFrameUrl} from '../../../src/utils/rearLyricsFrameUrl';

// Preserve camera calibration through the nested native stage frame.
it('forwards native preparation and measured camera geometry without forwarding unrelated parameters',()=>{
    expect(rearLyricsFrameUrl('?nativeCard=1&prepareUntil=12345&safeLeftPx=300&physicalWidthPx=976&token=secret'))
        .toBe('/rear-lyrics.html?layer=lyrics&nativeCard=1&prepareUntil=12345&safeLeftPx=300&physicalWidthPx=976');
    expect(rearLyricsFrameUrl('?safeLeftPx=0&physicalWidthPx=976')).toContain('safeLeftPx=0');
});
it('invalid or incomplete geometry uses the existing device fallback',()=>{
    for(const search of ['?safeLeftPx=300','?safeLeftPx=NaN&physicalWidthPx=976','?safeLeftPx=-1&physicalWidthPx=976',
        '?safeLeftPx=976&physicalWidthPx=976','?safeLeftPx=2&physicalWidthPx=0','?nativeCard=0&prepareUntil=10'])
        expect(rearLyricsFrameUrl(search)).toBe('/rear-lyrics.html?layer=lyrics');
    expect(rearLyricsFrameUrl('?nativeCard=1&prepareUntil=Infinity')).toBe('/rear-lyrics.html?layer=lyrics&nativeCard=1');
});

import { afterEach, expect, it, vi } from 'vitest';
import { createRearLyricsTransport } from '@/services/rearLyricsTransport';

// test/unit/services/rearTrackSwitch.test.ts
// The bug this covers: the rear surface kept the first song's last line forever, because the only
// publisher of lyrics/clock was the foreground WebView. Once that froze, the playhead kept
// extrapolating the old timeline and nothing ever announced that the track had changed.
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const baseConfig = { song: { id: 'k1', name: 'A' }, songArtist: 'a', lyrics: { lines: [{ fullText: 'A1', startTime: 0, endTime: 1 }] } };

function install(state: unknown, lyrics: unknown) {
    const target = new EventTarget();
    vi.stubGlobal('window', Object.assign(target, { setTimeout, clearTimeout }));
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => (url.includes('/lyrics') ? lyrics : state) }));
    vi.stubGlobal('fetch', fetcher);
    const beacons: string[] = [];
    // Diagnostics travel as an image beacon, so they are never counted as state requests.
    vi.stubGlobal('Image', function (this: unknown) { return { set src(value: string) { beacons.push(value); } }; } as never);
    return { fetcher, beacons };
}

it('a frozen foreground WebView hands the timeline to the native track and never keeps the old line', async () => {
    vi.useFakeTimers();
    // sentAtMs is one minute old: the main WebView is frozen, exactly like a locked screen.
    install({
        revision: 7, config: baseConfig,
        clock: { currentTime: 240, duration: 240, playerState: 'PLAYING', playbackRate: 1, sentAtMs: Date.now() - 60_000 },
        track: { songKey: 'k2', epoch: 'k2#2', title: 'B', artist: 'b', positionMs: 5_000, durationMs: 200_000, playing: true },
    }, { state: 'ready', lines: [{ fullText: 'B1', startTime: 4, endTime: 9, words: [] }] });
    const config = vi.fn(), clock = vi.fn();
    const stop = createRearLyricsTransport(() => undefined, () => undefined, false)
        .subscribe({ config, clock, audio: vi.fn(), connected: vi.fn() });
    await vi.advanceTimersByTimeAsync(400);
    // The old timeline is never used: the first native clock restarts at the new song's position.
    expect(clock.mock.lastCall?.[0].currentTime).toBe(5);
    expect(clock.mock.lastCall?.[0].timelineId).toBe('native:k2');
    expect(config.mock.lastCall?.[0].song.id).toBe('k2');
    expect(config.mock.lastCall?.[0].lyrics.lines).toHaveLength(1);
    expect(config.mock.lastCall?.[0].lyrics.lines[0].fullText).toBe('B1');
    // Visual settings are preserved: this is a patch, not a new configuration.
    expect(config.mock.lastCall?.[0].lyricsFontScale).toBe(baseConfig.hasOwnProperty('lyricsFontScale')
        ? (baseConfig as Record<string, unknown>).lyricsFontScale : undefined);
    stop();
});

it('clears the lyric timeline before the new song s lyrics exist', async () => {
    vi.useFakeTimers();
    install({
        revision: 4, config: baseConfig,
        clock: { currentTime: 200, duration: 200, playerState: 'PLAYING', playbackRate: 1, sentAtMs: Date.now() - 60_000 },
        track: { songKey: 'k2', epoch: 'k2#9', title: 'B', positionMs: 0, durationMs: 100_000, playing: true },
    }, { state: 'loading' });
    const config = vi.fn();
    const stop = createRearLyricsTransport(() => undefined, () => undefined, false)
        .subscribe({ config, clock: vi.fn(), audio: vi.fn(), connected: vi.fn() });
    await vi.advanceTimersByTimeAsync(200);
    const cleared = config.mock.calls.find(call => call[0].song.id === 'k2');
    expect(cleared).toBeTruthy();
    expect(cleared?.[0].lyrics.lines).toEqual([]);
    stop();
});

it('a fresh foreground clock is never overridden by the native fallback', async () => {
    vi.useFakeTimers();
    install({
        revision: 2, config: baseConfig,
        clock: { currentTime: 12, duration: 200, playerState: 'PLAYING', playbackRate: 1, sentAtMs: Date.now() },
        track: { songKey: 'k1', epoch: 'k1#1', title: 'A', positionMs: 99_000, durationMs: 200_000, playing: true },
    }, { state: 'ready', lines: [] });
    const clock = vi.fn(), config = vi.fn();
    const stop = createRearLyricsTransport(() => undefined, () => undefined, false)
        .subscribe({ config, clock, audio: vi.fn(), connected: vi.fn() });
    await vi.advanceTimersByTimeAsync(300);
    expect(clock.mock.lastCall?.[0].currentTime).toBe(12);
    expect(clock.mock.lastCall?.[0].timelineId).toBeUndefined();
    // Only the published configuration, never a synthetic patch for the same song.
    expect(config).toHaveBeenCalledTimes(1);
    stop();
});

it('ignores a lyric answer whose epoch no longer matches the playing song', async () => {
    vi.useFakeTimers();
    install({
        revision: 5, config: baseConfig,
        clock: { currentTime: 240, duration: 240, playerState: 'PLAYING', playbackRate: 1, sentAtMs: Date.now() - 60_000 },
        track: { songKey: 'k3', epoch: 'k3#3', title: 'C', positionMs: 1_000, durationMs: 100_000, playing: true },
    }, { state: 'stale', lines: [{ fullText: 'WRONG', startTime: 0, endTime: 1 }] });
    const config = vi.fn();
    const stop = createRearLyricsTransport(() => undefined, () => undefined, false)
        .subscribe({ config, clock: vi.fn(), audio: vi.fn(), connected: vi.fn() });
    await vi.advanceTimersByTimeAsync(2000);
    const texts = config.mock.calls.flatMap(call => (call[0].lyrics.lines ?? []).map((line: { fullText: string }) => line.fullText));
    expect(texts).not.toContain('WRONG');
    stop();
});

it('reports every link of the identity chain once, so a stuck line is attributable', async () => {
    vi.useFakeTimers();
    const { beacons } = install({
        revision: 8, config: baseConfig,
        clock: { currentTime: 240, duration: 240, playerState: 'PLAYING', playbackRate: 1, sentAtMs: Date.now() - 60_000 },
        track: { songKey: 'k2', epoch: 'k2#11', title: 'B', artist: 'b', positionMs: 2_000, durationMs: 200_000, playing: true },
    }, { state: 'ready', lines: [{ fullText: 'B1', startTime: 1, endTime: 6, words: [] }] });
    const stop = createRearLyricsTransport(() => undefined, () => undefined, false)
        .subscribe({ config: vi.fn(), clock: vi.fn(), audio: vi.fn(), connected: vi.fn() });
    // Several heartbeats: the trace must stay a timeline, not become a heartbeat log by itself.
    await vi.advanceTimersByTimeAsync(4000);
    const report = beacons.join(' | ');
    expect(report).toContain('event=switch');
    expect(report).toContain('k2%2311');
    expect(report).toContain('event=render');
    expect(report).toContain('event=clock');
    expect(report).toContain('source%3Dnative');
    expect(beacons.filter(beacon => beacon.includes('event=switch'))).toHaveLength(1);
    expect(beacons.filter(beacon => beacon.includes('event=render'))).toHaveLength(1);
    stop();
});

it('keeps asking past the fast tier so a late lyric still reaches the rear screen', async () => {
    vi.useFakeTimers();
    // 真机 2026-10-31：歌词在切歌 ~12s 后才补到（锁屏链路慢）。旧实现 8 次×1.5s 用完就
    // 永远 loading；新实现慢速档继续有界恢复。
    const target = new EventTarget();
    vi.stubGlobal('window', Object.assign(target, { setTimeout, clearTimeout }));
    let lyricCalls = 0;
    const fetcher = vi.fn(async (url: string) => {
        if (!url.includes('/lyrics')) return { ok: true, json: async () => ({ revision: 3, config: baseConfig, clock: { currentTime: 1, duration: 100, playerState: 'PLAYING', playbackRate: 1, sentAtMs: Date.now() - 60_000 }, track: { songKey: 'k9', epoch: 'k9#1', title: 'Late', positionMs: 1_000, durationMs: 100_000, playing: true } }) };
        lyricCalls += 1;
        return lyricCalls <= 9
            ? { ok: true, json: async () => ({ state: 'loading' }) }
            : { ok: true, json: async () => ({ state: 'ready', lines: [{ fullText: 'late line', startTime: 1, endTime: 5, words: [] }] }) };
    });
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('Image', function (this: unknown) { return { set src(_value: string) { } }; } as never);
    const config = vi.fn();
    const stop = createRearLyricsTransport(() => undefined, () => undefined, false)
        .subscribe({ config, clock: vi.fn(), audio: vi.fn(), connected: vi.fn() });
    // 快速档 8 次×1.5s + 慢速档第 2 次命中（2×5s）≈ 23s，全部用假时钟推进。
    await vi.advanceTimersByTimeAsync(25_000);
    const applied = config.mock.calls.filter(call => call[0].lyrics?.lines?.length === 1);
    expect(applied.length).toBeGreaterThan(0);
    expect(applied[applied.length - 1][0].lyrics.lines[0].fullText).toBe('late line');
    expect(lyricCalls).toBeLessThanOrEqual(12);
    stop();
});

it('a never-arriving lyric gives up bounded and never polls forever', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    vi.stubGlobal('window', Object.assign(target, { setTimeout, clearTimeout }));
    let lyricCalls = 0;
    const fetcher = vi.fn(async (url: string) => {
        if (!url.includes('/lyrics')) return { ok: true, json: async () => ({ revision: 3, config: baseConfig, clock: { currentTime: 1, duration: 100, playerState: 'PLAYING', playbackRate: 1, sentAtMs: Date.now() - 60_000 }, track: { songKey: 'k10', epoch: 'k10#1', title: 'None', positionMs: 0, durationMs: 100_000, playing: true } }) };
        lyricCalls += 1;
        return { ok: true, json: async () => ({ state: 'loading' }) };
    });
    vi.stubGlobal('fetch', fetcher);
    const beacons: string[] = [];
    vi.stubGlobal('Image', function (this: unknown) { return { set src(value: string) { beacons.push(value); } }; } as never);
    const stop = createRearLyricsTransport(() => undefined, () => undefined, false)
        .subscribe({ config: vi.fn(), clock: vi.fn(), audio: vi.fn(), connected: vi.fn() });
    await vi.advanceTimersByTimeAsync(120_000);
    // 首次 + 8 次快 + 4 次慢 = 13 次封顶，之后一分钟内零请求。
    expect(lyricCalls).toBe(13);
    expect(beacons.join(' ')).toContain('event=lyric-timeout');
    const after = lyricCalls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lyricCalls).toBe(after);
    stop();
});

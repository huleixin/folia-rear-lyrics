import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bug, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import CoverStack from '../src/dev/coverStack/CoverStack';
import ParamsPanel from '../src/dev/coverStack/ParamsPanel';
import { useCoverStack, type QueueSize } from '../src/dev/coverStack/useCoverStack';
import { formatDuration, trackArtistLabel } from '../src/dev/coverStack/demoTracks';
import { DEFAULT_PARAMS, type CoverStackParams } from '../src/dev/coverStack/params';
import type { LoopMode } from '../src/dev/coverStack/demoQueue';
import '../src/dev/coverStack/coverStack.css';

// dev/coverStackPreview.tsx
// 独立 Demo 页：不碰正式播放器，只用一套自己的队列 + 堆叠控制器验证视觉和手感。
// 调试读数与参数面板都是低频写 DOM / 低频 setState，动画本身不经过 React。

const LOOP_LABEL: Record<LoopMode, string> = { all: '列表循环', one: '单曲循环', off: '不循环' };
const QUEUE_LABEL: Record<QueueSize, string> = { full: '7 首队列', single: '单曲队列', empty: '空队列' };
const NEXT_LOOP: Record<LoopMode, LoopMode> = { all: 'one', one: 'off', off: 'all' };
const NEXT_QUEUE: Record<QueueSize, QueueSize> = { full: 'single', single: 'empty', empty: 'full' };

export default function CoverStackPreview() {
    const [params, setParams] = useState<CoverStackParams>(DEFAULT_PARAMS);
    const stack = useCoverStack(params);
    const stackRef = useRef(stack);
    stackRef.current = stack;

    const [playing, setPlaying] = useState(true);
    const [debugOpen, setDebugOpen] = useState(true);
    const [paramsOpen, setParamsOpen] = useState(false);
    const [queueSize, setQueueSize] = useState<QueueSize>('full');
    const fields = useRef<Record<string, HTMLElement | null>>({});
    const setField = (name: string) => (element: HTMLElement | null) => { fields.current[name] = element; };

    const { preview, phase } = stack;
    const busy = phase !== 'idle';
    const current = preview.current;

    // 调试读数：低频写 DOM，不进 React 渲染
    useEffect(() => {
        if (!debugOpen) return undefined;
        const write = (name: string, value: string) => {
            const element = fields.current[name];
            if (element && element.textContent !== value) element.textContent = value;
        };
        const id = window.setInterval(() => {
            const snapshot = stackRef.current.telemetry();
            write('phase', snapshot.phase);
            write('p', snapshot.p.toFixed(3));
            write('edgeX', `${Math.round(snapshot.edgeX)}px`);
            write('edgeY', `${Math.round(snapshot.edgeY)}px`);
            write('speed', `${Math.round(snapshot.speed)}px/s`);
            write('trail', snapshot.trail.toFixed(3));
            write('cards', String(stackRef.current.cards.length));
            write('commits', String(snapshot.stats.commits));
            write('reason', `${snapshot.stats.trigger} · ${snapshot.stats.reason}`);
        }, 120);
        return () => window.clearInterval(id);
    }, [debugOpen]);

    const plan = useMemo(() => preview.plan.slice(0, 5).map(track => track.name).join(' → '), [preview.plan]);
    const patchParams = (patch: Partial<CoverStackParams>) => setParams(prev => ({ ...prev, ...patch }));

    return (
        <div className="cs-page">
            <header className="cs-header">
                <div>
                    <h1>相册堆叠切歌</h1>
                    <p>任意方向拖动抽走 · 右滑把上一首放回来</p>
                </div>
                <span className="cs-tag">DEMO 2</span>
            </header>

            <main className="cs-main">
                <div className="cs-stage">
                    <div className="cs-drag-surface" {...stack.surfaceProps} data-testid="drag-surface">
                        <CoverStack
                            cards={stack.cards}
                            phase={phase}
                            cardRef={stack.cardRef}
                            ghostRef={stack.ghostRef}
                            stackRef={stack.setStackElement}
                        />
                    </div>
                </div>

                <div className="cs-meta">
                    <strong key={current?.id ?? 'empty'}>{current?.name ?? '队列为空'}</strong>
                    <span>{trackArtistLabel(current) || '—'}</span>
                    <small>
                        {current ? `${current.album.name} · ${formatDuration(current.durationMs)}` : '在资料库里挑几首歌再试'}
                    </small>
                </div>

                <div className="cs-transport">
                    <button
                        type="button"
                        className="cs-btn cs-btn--nav"
                        onClick={() => stack.skip('prev')}
                        disabled={!preview.canGoPrev || busy}
                        aria-label="上一首"
                        data-testid="prev"
                    >
                        <SkipBack size={22} strokeWidth={1.6} />
                    </button>
                    <button type="button" className="cs-btn cs-btn--play" onClick={() => setPlaying(value => !value)} aria-label={playing ? '暂停' : '播放'}>
                        {playing ? <Pause size={24} strokeWidth={1.6} /> : <Play size={24} strokeWidth={1.6} />}
                    </button>
                    <button
                        type="button"
                        className="cs-btn cs-btn--nav"
                        onClick={() => stack.skip('next')}
                        disabled={!preview.canGoNext || busy}
                        aria-label="下一首"
                        data-testid="next"
                    >
                        <SkipForward size={22} strokeWidth={1.6} />
                    </button>
                </div>

                <div className="cs-modes">
                    <button
                        type="button"
                        className="cs-chip"
                        data-on={preview.shuffle}
                        onClick={() => stack.setShuffle(!preview.shuffle)}
                        data-testid="shuffle"
                    >
                        <Shuffle size={13} strokeWidth={1.7} /> 随机
                    </button>
                    <button type="button" className="cs-chip" data-on={preview.loop !== 'off'} onClick={() => stack.setLoop(NEXT_LOOP[preview.loop])} data-testid="loop">
                        {preview.loop === 'one' ? <Repeat1 size={13} strokeWidth={1.7} /> : <Repeat size={13} strokeWidth={1.7} />}
                        {LOOP_LABEL[preview.loop]}
                    </button>
                    <button
                        type="button"
                        className="cs-chip"
                        onClick={() => {
                            const next = NEXT_QUEUE[queueSize];
                            setQueueSize(next);
                            stack.setQueueSize(next);
                        }}
                        data-testid="queue-size"
                    >
                        {QUEUE_LABEL[queueSize]}
                    </button>
                </div>
            </main>

            <section className="cs-debug">
                <button type="button" className="cs-debug__toggle" onClick={() => setDebugOpen(open => !open)} aria-expanded={debugOpen}>
                    <Bug size={12} strokeWidth={1.8} /> 动画读数 {debugOpen ? '收起' : '展开'}
                </button>
                {debugOpen ? (
                    <div className="cs-debug__grid">
                        <div>phase <b ref={setField('phase')}>idle</b></div>
                        <div>进度 p <b ref={setField('p')}>0.000</b></div>
                        <div>位移 X <b ref={setField('edgeX')}>0px</b></div>
                        <div>位移 Y <b ref={setField('edgeY')}>0px</b></div>
                        <div>速度 <b ref={setField('speed')}>0px/s</b></div>
                        <div>残影 <b ref={setField('trail')}>0.000</b></div>
                        <div>卡片 <b ref={setField('cards')}>3</b></div>
                        <div>切歌次数 <b ref={setField('commits')}>0</b></div>
                        <div className="cs-debug__row">
                            上一首 <em>{preview.prev?.name ?? '无'}</em> · 下一首 <em>{preview.upcoming[0]?.name ?? '无'}</em> · 下下首{' '}
                            <em>{preview.upcoming[1]?.name ?? '无'}</em>
                        </div>
                        <div className="cs-debug__row">播放计划 {plan || '—'}</div>
                        <div className="cs-debug__row">上次触发 <em ref={setField('reason')}>—</em></div>
                    </div>
                ) : null}
            </section>

            <ParamsPanel
                params={params}
                open={paramsOpen}
                onToggle={() => setParamsOpen(open => !open)}
                onChange={patchParams}
                onReset={() => setParams(DEFAULT_PARAMS)}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(<CoverStackPreview />);

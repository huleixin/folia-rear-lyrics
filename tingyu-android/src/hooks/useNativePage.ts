import { noteUiInteraction, markStartupReady } from '../services/uiWarmup';
import { diagnosticEvent, millisecondsSinceInteraction } from '../services/diagnostics/diagnosticLog';
import { navigationMark } from '../services/navigationTiming';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { NATIVE_FIRST, canUseNativePages, nativePages } from '../services/nativePages';
import { newChromeGeneration } from '../services/nativeChrome';
import { isMainStageActive, subscribeMainStageActivity } from '../utils/stageActivity';
import type { NativePageId, NativePageModel, PageActions } from '../types/nativePages';
import '../styles/nativePages.css';
import { useNativePageImages } from './useNativePageImages';
import { useStableNativeData } from './useStableNativeData';
import { sameNativeEnvelope } from '../utils/nativePacketData';
import {flushNativeShellRoute} from '../services/nativeShellCommit';
import { refreshNativeSettingsDocument, settingsDiagnostic } from '../services/settingsDiagnostics';

/**
 * 跨挂载单调 revision（2026-11-05 入场错位专项）：原生 ChromeFrameOrder 的墓碑按
 * (generation, session) 记账，而会话内 generation 恒定——若 revision 每次挂载都从 1
 * 重新计数，任何被 pageRemove retire 过的页面（即每次进播放器后的首页）重新挂载时
 * 都会被永久拒收，整个会话回退 WebView。改为每页单调递增后：新挂载必然更大，
 * 旧会话的迟到包必然更小，墓碑语义不变而不再误伤。
 */
const pageRevisions = new Map<string, number>();
const nextPageRevision = (id: string): number => {
    const next = (pageRevisions.get(id) ?? 0) + 1;
    pageRevisions.set(id, next);
    return next;
};

export function useNativePagesAvailable() {
    const [available,setAvailable]=useState(NATIVE_FIRST);
    useEffect(()=>{let alive=true;void canUseNativePages().then(value=>{if(alive)setAvailable(NATIVE_FIRST||value)});return()=>{alive=false}},[]);
    return available;
}

// src/hooks/useNativePage.ts
// A page sends discrete models only. Scrolling, IME, image loading and list recycling are native.
// model 为 null 表示「数据未就绪、暂不发包」（2026-11-06 启动专项）：measure 直接短路，
// 原生继续呈递上一包 / NativeShellCache 缓存页，直到调用方给出真实模型。
export function useNativePage(ref: RefObject<HTMLElement | null>, id: NativePageId, active: boolean,
    model: NativePageModel | null, actions: PageActions, onReady?: (ready: boolean) => void) {
    model=useNativePageImages(useStableNativeData(model),active);
    // 页面进入的统一记账：sinceTapMs 是从最近一次触摸算起，正好回答「首次打开设置/搜索/
    // 资料库要多久」。只在 active 变化时记一条，不参与渲染。
    useEffect(() => {
        if (!active) return;
        const sinceTapMs = millisecondsSinceInteraction();
        diagnosticEvent('nav', 'info', `page-enter:${String(id).slice(0, 24)}`,
            sinceTapMs === undefined ? undefined : { sinceTapMs });
    }, [id, active]);
    const [ready, setReady] = useState(NATIVE_FIRST);
    const latest = useRef({ active, model, actions, onReady }); latest.current = { active, model, actions, onReady };
    const sync = useRef<() => void>(() => {});
    useLayoutEffect(() => { if(NATIVE_FIRST&&ref.current)ref.current.dataset.nativePage='true';sync.current(); },[model,active,ref]);
    // Adapters may live below the element owning ref. Its DOM ref is attached after
    // descendant layout effects; subscribe after commit so cold-start data is never missed.
    useEffect(() => {
        const node = ref.current; if (!node || !active) return;
        if(NATIVE_FIRST)node.dataset.nativePage='true';
        const session = crypto.randomUUID(), generation = newChromeGeneration();
        let disposed = false, started = false, revision = 0, frame = 0;
        let last: object | undefined;
        let listener: { remove(): Promise<void> } | undefined;
        let resize: ResizeObserver | undefined, mutation: MutationObserver | undefined, unsubscribe: (() => void) | undefined;
        /** 被拒后的重试定时器：路由提交滞后是常态，拒一次不等于页面该死。 */
        let retryTimer = 0;
        /** 连续拒收次数，用于退避；受理成功即清零。 */
        let rejectStreak = 0;
        const mark = (value: boolean) => {
            if (disposed) return;
            // CSS 归属按 NATIVE_FIRST（Android 上捕获容器必须保持隐藏，否则旧 DOM 会从原生
            // 页下面露出来）；但 ready 只上报真实结果 —— 不允许"强制 ready=true 假装接管成功"。
            // Android 上旧 DOM 分支已改为编译期剔除，ready=false 不会复活旧页面，
            // 失败面由原生 NativePageFallbackPanel 承担（错误状态 + 重试）。
            if (NATIVE_FIRST||value) node.dataset.nativePage = 'true'; else delete node.dataset.nativePage;
            setReady(value); latest.current.onReady?.(value);
        };
        const remove = () => nativePages.pageRemove({ id, session }).catch(() => {});
        const measure = () => {
            const measuredAt=performance.timeOrigin+performance.now();
            frame = 0; if (disposed || !started) return;
            if(!isMainStageActive())return;
            flushNativeShellRoute();
            // 极简入场窗口（路由已指向 stage、呈现为 minimal）：首页此刻正被原生页整块举着，
            // 等极简页 360ms 上滑盖住。这里任何 ownership 翻转都会把 WebView 回退副本挂回来
            // —— 录屏 68537 的 0.53~0.70s「推荐标题/卡片重复、放大错位、右侧碎片」的来源。
            // 入场期间冻结首页的发布与摘除；窗口随路由离开 stage 或组件卸载自然结束。
            const presentation = document.querySelector('[data-folia-player-presentation]')?.getAttribute('data-folia-player-presentation') ?? '';
            const minimalEntryFreeze = NATIVE_FIRST && id === 'home' && presentation === 'minimal'
                && document.documentElement.dataset.nativeRoute === 'stage';
            if (minimalEntryFreeze) {
                // 排查埋点：innerWidth 含滚动条、clientWidth 不含 —— 两者差值就是
                // 「viewport 记错了 8%」类几何包问题的直接证据。
                console.info('[entry-debug] home frozen during minimal entry',
                    JSON.stringify({ route: document.documentElement.dataset.nativeRoute, presentation,
                        innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth,
                        rect: node.getBoundingClientRect().toJSON() }));
                return;
            }
            const current = latest.current, rect = node.getBoundingClientRect(), style = getComputedStyle(node);
            // 页面声明数据未就绪：不发空态包顶掉缓存页，也不翻转 ready —— 原生保持现状。
            if(!current.model)return;
            // A document capture and its key are one model. Never publish a header-only
            // settings/index substitute between the two layout-effect passes.
            if(current.model.key.startsWith('settings:document:')&&!current.model.document)return;
            const enabled = current.active && isMainStageActive() && (NATIVE_FIRST&&id==='collection'||!node.closest('[inert]'))
                && (style.visibility !== 'hidden'||node.dataset.nativeDocumentRoot==='true') && style.display !== 'none' && rect.width > 0 && rect.height > 0;
            const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--folia-main-inset-top')) || 0;
            const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--folia-main-inset-bottom')) || 0;
            const packet = { id, session, generation, enabled, left: rect.left, top: rect.top, width: rect.width,
                height: rect.height, viewportWidth: innerWidth, safeTop, safeBottom, model: current.model,
                navigation:document.documentElement.dataset.nativeNavigation??'' };
            if (sameNativeEnvelope(last, packet)) return; last = packet;
            const sent = revision = nextPageRevision(id); if (!enabled) mark(false);
            navigationMark('page-layout-capture',measuredAt);
            navigationMark('page-send');
            void nativePages.pageUpdate({ ...packet, revision: sent }).then(result => {
                navigationMark('page-ack');
                if (disposed) { void remove(); return; }
                if (sent === revision) {const accepted=enabled && result.accepted && result.session === session;mark(accepted);if(accepted){rejectStreak=0;markStartupReady('page');}
                    if(enabled&&!accepted){
                        last=undefined;
                        // 拒收回执=路由/导航戳还没跟上（回到首页时 shell 提交滞后于页面挂载）。
                        // 没有新的 DOM 变化就不会再触发 measure —— 不主动重试，这一页就永远缺席。
                        // 退避：80/200/500/1000/2000ms 封顶，受理成功即清零；避免持续拒收时空转。
                        rejectStreak+=1;
                        const wait=Math.min(2000,80*Math.pow(2.5,Math.min(rejectStreak-1,4)));
                        if(!retryTimer)retryTimer=window.setTimeout(()=>{retryTimer=0;schedule();},wait);
                        settingsDiagnostic('page-rejected',{id,session,key:current.model?.key??'',navigation:packet.navigation,reason:result.reason??'native-rejected'});}
                }
            }).catch(error => {
                if (sent !== revision || disposed) return;
                // 桥调用失败 = 该页永久回退 WebView。原因进 logcat（Chromium console），不再黑箱。
                console.warn('[NativePages] Native page update failed', error);
                last = undefined; mark(false);
            });
        };
        const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(measure); };
        sync.current = schedule;
        void canUseNativePages().then(async supported => {
            if (!supported || disposed) return;
            listener = await nativePages.addListener('pageAction', event => {
                const current = latest.current;
                if(disposed||!current.active||event.id!==id)return;
                if(event.action==='__refresh'){
                    last=undefined;refreshNativeSettingsDocument(event.text??'native-stale-presentation');schedule();return;
                }
                const reason=event.session!==session?'session-mismatch':event.key!==current.model?.key?'key-mismatch':node.dataset.nativePage!=='true'?'ownership-mismatch':!current.actions[event.action]?'unknown-control':'';
                settingsDiagnostic(reason?'action-rejected':'action-accepted',{id,session,key:current.model?.key??'',eventSession:event.session,eventKey:event.key,control:event.action,route:document.documentElement.dataset.nativeRoute,navigation:document.documentElement.dataset.nativeNavigation,reason});
                if(reason){last=undefined;refreshNativeSettingsDocument(reason);schedule();return;}
                noteUiInteraction();
                navigationMark('page-event-js',event.nativeDispatchedAt,event.nativeGestureId);
                navigationMark('page-business-start',undefined,event.nativeGestureId);
                current.actions[event.action]?.({ text: event.text, value: event.value });
            });
            navigationMark('page-listener-ready');
            if (disposed) { void listener.remove(); return; }
            started = true; resize = new ResizeObserver(schedule); resize.observe(node);
            mutation = new MutationObserver(records => {
                if (records.some(record => record.type === 'childList'
                    ? [...record.addedNodes, ...record.removedNodes].some(item => item instanceof Element &&
                        (item.matches('[data-folia-keyboard-window]') || item.querySelector('[data-folia-keyboard-window]')))
                    : record.attributeName === 'data-folia-keyboard-window' || record.target instanceof Element && record.target.contains(node))) measure();
            });
            mutation.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert', 'data-folia-keyboard-window'] });
            unsubscribe = subscribeMainStageActivity(measure);
            window.addEventListener('resize', schedule); window.visualViewport?.addEventListener('resize', schedule);
            document.addEventListener('tingyu-native-navigation',schedule);
            measure();
        }).catch(() => mark(false));
        return () => {
            disposed = true; window.clearTimeout(retryTimer); cancelAnimationFrame(frame); resize?.disconnect(); mutation?.disconnect(); unsubscribe?.();
            window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule);
            document.removeEventListener('tingyu-native-navigation',schedule);
            if(!NATIVE_FIRST)delete node.dataset.nativePage;
            setReady(NATIVE_FIRST); latest.current.onReady?.(NATIVE_FIRST);
            void listener?.remove(); if (started) void remove(); sync.current = () => {};
        };
    }, [active, id, ref]);
    return ready;
}

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { GLASS_LAB, glassNative, readGlassMode, setGlassMode, subscribeGlassMode, type GlassStatus, type GlassMode } from '../../../services/glassExperiment';

// src/components/modal/settings/GlassExperimentSection.tsx
export default function GlassExperimentSection() {
    const mode = useSyncExternalStore(subscribeGlassMode, readGlassMode);
    const [status, setStatus] = useState<GlassStatus | null>(null);
    useEffect(() => {
        if (!GLASS_LAB) return;
        let disposed = false;
        void glassNative.probe().then(value => { if (!disposed) setStatus(value); })
            .catch(() => { if (!disposed) setStatus({ native: false, xiaomi: false, detail: '此环境没有安卓原生玻璃能力，继续使用现有底栏。' }); });
        return () => { disposed = true; };
    }, []);
    if (!GLASS_LAB) return null;
    return <section data-testid="glass-experiment" className="rounded-2xl border border-current/15 p-4 space-y-3">
        <div className="font-medium">底栏材质 · 本机实验</div>
        <p className="text-xs opacity-70">默认的底栏、迷你播放器和舞台控件统一使用轻量柔光。此处仅实验导航栏的原生材质，关闭设置后查看效果。</p>
        <div className="flex flex-wrap gap-2">
            {([['web', '轻量柔光（默认）'], ['native', '原生轻玻璃'], ['xiaomi', '小米系统玻璃']] as [GlassMode, string][]).map(([value, label]) =>
                <button key={value} type="button" aria-pressed={mode === value}
                    disabled={value !== 'web' && (!status || !(value === 'native' ? status.native : status.xiaomi))}
                    onClick={() => setGlassMode(value)} className="rounded-xl border border-current/20 px-3 py-2 text-sm disabled:opacity-30"
                    style={{ background: mode === value ? '#86d8b82b' : 'transparent' }}>{label}</button>)}
        </div>
        <p className="text-xs opacity-60 break-words">{status?.detail ?? '正在检查本机支持情况…'}</p>
    </section>;
}

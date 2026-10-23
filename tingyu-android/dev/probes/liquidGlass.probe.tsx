import React, { useEffect, useRef, useState } from 'react';
import type { ProbeDefinition } from './definition';
import { createGlass, engine } from '../../src/vendor/liquid-glass/liquid-glass.js';

const Lens: React.FC<{ optical: boolean; label: string }> = ({ optical, label }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const node = ref.current;
        if (!node || !optical) return;
        const glass = createGlass(node, {
            mode: 'backdrop',
            fit: true,
            radius: 24,
            refraction: 30,
            bezel: 0.5,
            curvature: 3,
            chroma: 0.06,
            specular: 0.8,
            mapScale: 1,
        });
        node.dataset.glassEngine = engine === 'blink' ? 'backdrop-refraction' : 'fallback-blur';
        return () => glass.destroy();
    }, [optical]);

    return (
        <div className="lg-probe-card">
            <strong>{label}</strong>
            <span className="lg-probe-backdrop-word" aria-hidden="true">心雨 · Folia · 玻璃折射</span>
            <div ref={ref} className={`lg-probe-lens ${optical ? 'lg-probe-optical' : ''}`} data-testid={optical ? 'optical-lens' : 'blur-lens'}>
                <span>FOLIA · 光学边缘</span>
                <span className="lg-probe-hint">观察线条和字形在圆角边缘处是否弯曲</span>
            </div>
            <small>{optical ? `createGlass() · ${engine}` : '普通 CSS backdrop-filter: blur()'}</small>
        </div>
    );
};

const LiquidGlassProbe: React.FC = () => {
    const [mode, setMode] = useState<'compare' | 'blur' | 'optical'>('compare');
    return (
        <main className="lg-probe-page">
            <style>{`
                .lg-probe-page{min-height:100vh;padding:22px;color:#fff;font:14px/1.4 system-ui,sans-serif;background:#101318}
                .lg-probe-page h1{font-size:22px;margin:0 0 6px}.lg-probe-page p{color:#c7ced6;margin:0 0 16px}
                .lg-probe-switch{display:flex;gap:8px;margin-bottom:18px}.lg-probe-switch button{padding:9px 14px;border:1px solid #ffffff40;border-radius:999px;background:#ffffff12;color:white}
                .lg-probe-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}
                .lg-probe-card{position:relative;min-height:300px;padding:12px;border-radius:22px;overflow:hidden;background:#222831}
                .lg-probe-card:before{content:'';position:absolute;inset:46px 0 36px;z-index:0;
                  background:repeating-linear-gradient(90deg,transparent 0 28px,#f9f4df 28px 36px,transparent 36px 56px),
                  repeating-linear-gradient(0deg,#1724d8 0 22px,#ef3558 22px 44px,#f2b331 44px 66px,#25bd88 66px 88px);
                  background-blend-mode:screen;opacity:.9}
                .lg-probe-card>strong,.lg-probe-card>small{position:relative;z-index:2}.lg-probe-card>small{display:block;margin-top:10px;color:#e1e7eb}
                .lg-probe-backdrop-word{position:absolute;z-index:0;left:-15%;right:-15%;top:78px;text-align:center;font-size:32px;font-weight:850;letter-spacing:.08em;color:#fff;text-shadow:0 2px 7px #101010;transform:rotate(-8deg);white-space:nowrap}
                .lg-probe-lens{position:absolute;z-index:1;left:10%;right:10%;top:88px;height:130px;border-radius:24px;border:1px solid #ffffffa0;
                  display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:10px;
                  color:white;background:rgb(20 26 32 / .24);box-shadow:inset 0 1px 0 #ffffff8c,inset 0 -1px 0 #ffffff30,0 8px 28px #0006;
                  backdrop-filter:blur(10px) saturate(1.2);-webkit-backdrop-filter:blur(10px) saturate(1.2)}
                .lg-probe-lens span:first-child{font-weight:800;font-size:22px;letter-spacing:.08em;text-shadow:0 1px 5px #0008}
                .lg-probe-hint{max-width:84%;font-size:12px;text-shadow:0 1px 4px #000}
                .lg-probe-grid[data-mode='blur'] [data-testid='optical-lens'],.lg-probe-grid[data-mode='optical'] [data-testid='blur-lens']{display:none}
                .lg-probe-optical[data-glass-engine='fallback-blur']{outline:2px solid #ffb35c}
            `}</style>
            <h1>Liquid Glass · A/B 光学验证</h1>
            <p>Chromium 引擎：{engine}。B 需在彩色线条/字形的玻璃边缘看到弯曲，而不只是更清晰或更模糊。</p>
            <div className="lg-probe-switch" role="group" aria-label="效果模式">
                <button onClick={() => setMode('compare')} aria-pressed={mode === 'compare'}>A/B 对比</button>
                <button onClick={() => setMode('blur')} aria-pressed={mode === 'blur'}>仅 A 普通毛玻璃</button>
                <button onClick={() => setMode('optical')} aria-pressed={mode === 'optical'}>仅 B 光学折射</button>
            </div>
            <div className="lg-probe-grid" data-mode={mode}>
                <Lens optical={false} label="A · 普通毛玻璃" />
                <Lens optical label="B · SVG 位移折射" />
            </div>
        </main>
    );
};

const definition: ProbeDefinition = {
    id: 'liquidGlass',
    title: 'Liquid Glass A/B optical test',
    description: '对比普通 blur 与 createGlass backdrop 折射；背景包含条纹、彩色块和字形。',
    Component: LiquidGlassProbe,
};

export default definition;

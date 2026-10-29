import React, { useEffect, useState } from 'react';
import { Check, FileCode2, Upload } from 'lucide-react';
import ThemedDialog from '../shared/ThemedDialog';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { type LxScript } from '../../services/lxSource/contract';
import { omni } from '../../services/onlineMusic/omni';
import { LxRuntime } from '../../services/lxSource/client';
import { pickLxScript } from '../../services/lxSource/importFile';

// src/components/audio-tools/LxSourceDialog.tsx
export default function LxSourceDialog({ isDaylight }: { isDaylight: boolean }) {
    const state = useLxSourceStore();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [failed, setFailed] = useState(false);
    const active = state.scripts.find(script => script.id === state.activeId);
    useEffect(() => { const back = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); if (!busy) state.close(); } }; window.addEventListener('keydown', back); return () => window.removeEventListener('keydown', back); }, [busy, state.close]);
    const test = async (script: Omit<LxScript, 'capabilities'>, save: boolean) => {
        setBusy(true); setFailed(false); setMessage('正在检查音源…');
        let runtime: LxRuntime | null = null;
        try { runtime = new LxRuntime(script); const capabilities = await runtime.ready; if (save) { state.save({ ...script, capabilities }); omni.activateLxSource(script.id); } setMessage(`初始化成功：${Object.values(capabilities).map(c => `${c.name} (${c.qualitys.join(' / ')})`).join('、')}。实际取流请播放对应平台的歌曲验证。`); }
        catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : String(error)); }
        finally { runtime?.stop(); setBusy(false); }
    };
    const importFile = async () => {
        if (busy) return;
        setBusy(true); setFailed(false); setMessage('请选择 .js 音源文件…');
        try {
            const script = await pickLxScript();
            if (script) await test(script, true); else setMessage('已取消选择');
        } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    };
    return <ThemedDialog isOpen onClose={state.close} closeDisabled={busy} isDaylight={isDaylight} title="洛雪自定义音源" panelKind="audio-tools"
        description="导入自定义脚本，为搜索和已登录平台的歌单选择播放音源。"
        surfaceColor={isDaylight ? '#f3f6ef' : '#101e19'} scrimColor={isDaylight ? 'rgba(3,10,8,0.90)' : 'rgba(3,10,8,0.94)'}>
        <div className="ty-lx-manager" data-light={isDaylight || undefined}>
            <button type="button" className="ty-lx-import" disabled={busy} onClick={() => void importFile()}>
                <Upload size={19}/><span><strong>{busy ? '正在处理…' : '导入并启用音源'}</strong><small>.js 文件 · 最大 1 MB</small></span>
            </button>
            <div className="ty-lx-current"><span>当前音源<strong>{active?.name || '平台原音源'}</strong></span>
                <button type="button" disabled={busy || !active} onClick={() => omni.activateLxSource(null)}>{active ? '恢复原音源' : '使用中'}</button>
            </div>
            {state.scripts.length === 0 && <div className="ty-lx-empty"><FileCode2 size={25}/><span>还没有导入音源</span><small>导入后会在这里显示支持的平台与音质</small></div>}
            <div className="ty-lx-scripts">{state.scripts.map(script => <section className="ty-lx-card" data-active={state.activeId === script.id || undefined} key={script.id}>
                <div className="ty-lx-heading"><FileCode2 size={18}/><strong>{script.name}</strong>{state.activeId === script.id && <span className="ty-lx-badge"><Check size={12}/>使用中</span>}</div>
                {(script.version || script.author) && <p className="ty-lx-meta">{[script.version, script.author].filter(Boolean).join(' · ')}</p>}
                <div className="ty-lx-platforms">{Object.entries(script.capabilities).map(([key, capability]) => <span key={key}>{capability.name}<small>{capability.qualitys.join(' / ')}</small></span>)}</div>
                {script.description && <details className="ty-lx-description"><summary>音源说明</summary><p>{script.description}</p></details>}
                <div className="ty-lx-actions"><button type="button" disabled={busy || state.activeId === script.id} aria-pressed={state.activeId === script.id} onClick={() => omni.activateLxSource(script.id)}>{state.activeId === script.id ? '已启用' : '启用'}</button><button type="button" disabled={busy} onClick={() => void test(script, false)}>检查音源</button><button type="button" className="ty-lx-remove" disabled={busy} onClick={() => { if (state.activeId===script.id) omni.activateLxSource(null); state.remove(script.id); }}>删除</button></div>
            </section>)}</div>
            {message && <p role={failed ? 'alert' : 'status'} className="ty-lx-message">{message}</p>}
            <details className="ty-lx-help"><summary>使用说明与兼容性</summary>
                <p>启用后可在搜索页选择脚本支持的平台。已登录平台的歌单和收藏也会使用所选音源播放，收藏和歌单归属不变。切换时保留播放位置。</p>
                <p>跨平台按歌名、歌手和时长匹配；失败会提示，不会自动切回原音源。未启用的脚本不会运行。</p>
                <p>支持 request、Buffer、MD5、AES；暂不支持依赖 RSA、zlib 或 multipart 的脚本。不内置第三方音源。</p>
            </details>
        </div>
    </ThemedDialog>;
}

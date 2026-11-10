import React, { useEffect, useRef, useState } from 'react';
import { Check, FileCode2, Upload } from 'lucide-react';
import ThemedDialog from '../shared/ThemedDialog';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { type LxScript } from '../../services/lxSource/contract';
import { omni } from '../../services/onlineMusic/omni';
import { LxRuntime } from '../../services/lxSource/client';
import { pickLxScript } from '../../services/lxSource/importFile';
import { useSettingsModalStore } from '../../stores/useSettingsModalStore';

// src/components/audio-tools/LxSourceDialog.tsx
export default function LxSourceDialog({ isDaylight }: { isDaylight: boolean }) {
    const state = useLxSourceStore();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [failed, setFailed] = useState(false);
    // 设置路由被其它方式关闭时，这里打开的弹窗不能留下来挂在首页上（68600）。
    // 导入/验证进行中（busy）保持不动：那是弹窗自己的操作面，等它跑完再收。
    const settingsOpen = useSettingsModalStore(store => store.settingsModalState.isOpen);
    const ownedBySettings = useRef(false);
    const orphanPending = useRef(false);
    useEffect(() => {
        if (settingsOpen) { ownedBySettings.current = true; orphanPending.current = false; return; }
        if (!ownedBySettings.current) return;
        ownedBySettings.current = false;
        if (busy) { orphanPending.current = true; return; }
        state.close();
    }, [settingsOpen, busy, state.close]);
    useEffect(() => {
        if (!orphanPending.current || busy) return;
        orphanPending.current = false;
        state.close();
    }, [busy, state.close]);
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
    return <ThemedDialog isOpen onClose={state.close} closeDisabled={busy} isDaylight={isDaylight} title="洛雪自定义音源" panelKind="audio-tools" description="导入自定义脚本，为搜索和已登录平台的歌单选择播放音源。">
        <div className="ty-lx-manager" data-settings-layout="column" data-settings-style='{"gap":12,"font":12}' data-light={isDaylight || undefined}>
            <button type="button" className="ty-lx-import" data-settings-layout="row" data-settings-style='{"gap":12,"align":"center","padding":[14,12,14,12],"radius":14,"border":true,"fill":true,"tone":"accent","minHeight":60}' disabled={busy} onClick={() => void importFile()}>
                <Upload size={19}/><span data-settings-layout="column" data-settings-style='{"grow":true,"gap":3}'><strong data-settings-layout="column" data-settings-style='{"font":13,"weight":600}'>{busy ? '正在处理…' : '导入并启用音源'}</strong><small data-settings-layout="column" data-settings-style='{"font":11,"tone":"muted"}'>.js 文件 · 最大 1 MB</small></span>
            </button>
            <div className="ty-lx-current" data-settings-layout="row" data-settings-style='{"gap":10,"align":"center","font":11,"padding":[2,2,2,2]}'><span data-settings-layout="column" data-settings-style='{"grow":true,"gap":3,"tone":"muted"}'>当前音源<strong data-settings-layout="column" data-settings-style='{"font":12,"weight":600,"tone":"text"}'>{active?.name || '平台原音源'}</strong></span>
                <button type="button" data-settings-style='{"border":true,"radius":10,"font":11,"padding":[10,6,10,6],"minHeight":40}' disabled={busy || !active} onClick={() => omni.activateLxSource(null)}>{active ? '恢复原音源' : '使用中'}</button>
            </div>
            {state.scripts.length === 0 && <div className="ty-lx-empty" data-settings-layout="column" data-settings-style='{"gap":8,"center":true,"tone":"muted","padding":[10,24,10,24]}'><FileCode2 size={25}/><span>还没有导入音源</span><small>导入后会在这里显示支持的平台与音质</small></div>}
            <div className="ty-lx-scripts" data-settings-layout="column" data-settings-style='{"gap":10}'>{state.scripts.map(script => <section className="ty-lx-card" data-settings-layout="card" data-settings-style='{"gap":10,"border":true,"radius":14,"padding":[12,12,12,12]}' data-active={state.activeId === script.id || undefined} key={script.id}>
                <div className="ty-lx-heading" data-settings-layout="row" data-settings-style='{"gap":8,"align":"center"}'><FileCode2 size={18}/><strong data-settings-layout="column" data-settings-style='{"grow":true,"font":13,"weight":600}'>{script.name}</strong>{state.activeId === script.id && <span className="ty-lx-badge" data-settings-layout="row" data-settings-style='{"gap":3,"tone":"accent","font":10,"align":"center"}'><Check size={12}/>使用中</span>}</div>
                {(script.version || script.author) && <p className="ty-lx-meta" data-settings-layout="column" data-settings-style='{"font":11,"tone":"muted"}'>{[script.version, script.author].filter(Boolean).join(' · ')}</p>}
                <div className="ty-lx-platforms" data-settings-layout="wrap" data-settings-style='{"gap":6}'>{Object.entries(script.capabilities).map(([key, capability]) => <span key={key} data-settings-layout="column" data-settings-style='{"gap":2,"font":11,"padding":[8,5,8,5],"fill":true,"radius":8}'>{capability.name}<small data-settings-layout="column" data-settings-style='{"font":10,"tone":"muted"}'>{capability.qualitys.join(' / ')}</small></span>)}</div>
                {script.description && <details className="ty-lx-description" data-settings-layout="column" data-settings-style='{"gap":8,"font":11,"tone":"muted"}'><summary data-settings-layout="row" data-settings-style='{"minHeight":40,"font":12,"tone":"accent"}'>音源说明</summary><p data-settings-layout="column">{script.description}</p></details>}
                <div className="ty-lx-actions" data-settings-layout="wrap" data-settings-style='{"gap":7}'><button type="button" data-settings-style='{"border":true,"radius":10,"minHeight":40,"padding":[12,7,12,7],"tone":"accent"}' disabled={busy || state.activeId === script.id} aria-pressed={state.activeId === script.id} onClick={() => omni.activateLxSource(script.id)}>{state.activeId === script.id ? '已启用' : '启用'}</button><button type="button" data-settings-style='{"border":true,"radius":10,"minHeight":40,"padding":[12,7,12,7]}' disabled={busy} onClick={() => void test(script, false)}>检查音源</button><button type="button" className="ty-lx-remove" data-settings-style='{"border":true,"radius":10,"minHeight":40,"padding":[12,7,12,7],"tone":"muted"}' disabled={busy} onClick={() => { if (state.activeId===script.id) omni.activateLxSource(null); state.remove(script.id); }}>删除</button></div>
            </section>)}</div>
            {message && <p role={failed ? 'alert' : 'status'} className="ty-lx-message" data-settings-layout="card" data-settings-style='{"font":11,"padding":[12,10,12,10],"radius":10}'>{message}</p>}
            <details className="ty-lx-help" data-settings-layout="column" data-settings-style='{"gap":10,"font":11,"tone":"muted"}'><summary data-settings-layout="row" data-settings-style='{"minHeight":40,"font":12,"tone":"accent"}'>使用说明与兼容性</summary>
                <p data-settings-layout="column">启用后可在搜索页选择脚本支持的平台。已登录平台的歌单和收藏也会使用所选音源播放，收藏和歌单归属不变。切换时保留播放位置。</p>
                <p data-settings-layout="column">跨平台按歌名、歌手和时长匹配；失败会提示，不会自动切回原音源。未启用的脚本不会运行。</p>
                <p data-settings-layout="column">支持 request、Buffer、MD5、AES；暂不支持依赖 RSA、zlib 或 multipart 的脚本。不内置第三方音源。</p>
            </details>
        </div>
    </ThemedDialog>;
}

import React, { useEffect, useState } from 'react';
import ThemedDialog from '../shared/ThemedDialog';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { parseLxScript, type LxScript } from '../../services/lxSource/contract';
import { LxRuntime } from '../../services/lxSource/client';

// src/components/audio-tools/LxSourceDialog.tsx
export default function LxSourceDialog({ isDaylight }: { isDaylight: boolean }) {
    const state = useLxSourceStore();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => { const back = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); state.close(); } }; window.addEventListener('keydown', back); return () => window.removeEventListener('keydown', back); }, []);
    const test = async (script: Omit<LxScript, 'capabilities'>, save: boolean) => {
        setBusy(true); setMessage('正在检查音源…');
        let runtime: LxRuntime | null = null;
        try { runtime = new LxRuntime(script); const capabilities = await runtime.ready; if (save) state.save({ ...script, capabilities }); setMessage(`初始化成功：${Object.values(capabilities).map(c => `${c.name} (${c.qualitys.join(' / ')})`).join('、')}。实际取流请播放对应平台的歌曲验证。`); }
        catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
        finally { runtime?.stop(); setBusy(false); }
    };
    return <ThemedDialog isOpen onClose={state.close} isDaylight={isDaylight} title="洛雪自定义音源" panelKind="audio-tools" description="导入你使用的洛雪 .js 音源。网易云、QQ、酷狗的搜索仍由原平台提供。">
        <label className="ty-source-entry" style={{ display:'block' }}>导入 .js 文件<input type="file" accept=".js,text/javascript,application/javascript" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { if (file.size > 1048576) throw Error('文件不能超过 1 MB'); await test(parseLxScript(await file.text()), true); } catch(error) { setMessage(String(error)); } }}/></label>
        <div className="ty-lx-actions"><button aria-pressed={!state.activeId} onClick={() => state.activate(null)}>使用原音源</button></div>
        {state.scripts.map(script => <section key={script.id} style={{ borderBottom:'1px solid #8884', padding:'12px 0' }}><strong>{script.name} {script.version}</strong><p className="ty-audio-hint">{script.description}<br/>{Object.values(script.capabilities).map(c => `${c.name}: ${c.qualitys.join('/')}`).join(' · ')}</p><div className="ty-lx-actions"><button disabled={busy} aria-pressed={state.activeId === script.id} onClick={() => state.activate(script.id)}>{state.activeId === script.id ? '已启用 ✓' : '启用'}</button><button disabled={busy} onClick={() => void test(script, false)}>检查</button><button disabled={busy} onClick={() => state.remove(script.id)}>删除</button></div></section>)}
        <p role="status" className="ty-audio-hint">{message || '未启用时不会运行音源脚本。音源切换从下次取流生效。'}</p>
        <p className="ty-audio-hint">支持常用 request、Buffer、MD5、AES；依赖 RSA、zlib 或 multipart 的脚本暂不兼容。不内置第三方音源。</p>
    </ThemedDialog>;
}

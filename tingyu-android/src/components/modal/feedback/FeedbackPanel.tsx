import React from 'react';
import { createPortal } from 'react-dom';
import { Activity, Camera, Check, ChevronLeft, FileArchive, Loader2, Music4, Send, Sparkles, Type, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInterfaceLight } from '../../../hooks/useInterfaceAppearance';
import { feedbackCopy } from '../../../i18n/feedbackCopy';
import { exportDiagnosticReport } from '../../../services/exportDiagnosticReport';
import {
    buildDiagnosticPreview,
    exportDiagnosticPackage,
    type FeedbackCategory,
    type FeedbackDraft,
} from '../../../services/diagnostics/diagnosticPackage';
import { captureScreenshots, MAX_FEEDBACK_SCREENSHOTS } from '../../../services/diagnostics/screenshotCapture';
import CloudFeedbackSection from './CloudFeedbackSection';
import {useFeedbackNavigation} from '../../../services/feedback/navigation';

// src/components/modal/feedback/FeedbackPanel.tsx
//
// 设置 → 关于 / 帮助 →「问题反馈」。
//
// 保留独立 portal 和原有反馈流程，通过语义布局声明交给 Compose 绘制原生弹窗。
// 视觉沿用现有玻璃卡：rounded-2xl + 1px 半透明描边 + 低对比底色，
// 深浅色由 useInterfaceLight() 显式取色，因为 portal 在 settings overlay 之外。

type Phase = 'idle' | 'previewing' | 'preview' | 'working' | 'shared' | 'failed';

type FeedbackPanelProps = { onClose: () => void };

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ onClose }) => {
    const { i18n } = useTranslation();
    const copy = feedbackCopy(i18n.language);
    const light = useInterfaceLight();
    const [category, setCategory] = React.useState<FeedbackCategory>('crash');
    const crashPrompt = useFeedbackNavigation(state=>state.crash);
    const [description, setDescription] = React.useState(crashPrompt?i18n.t('feedbackCloud.crashPrompt'):'');
    const [screenshots, setScreenshots] = React.useState<string[]>([]);
    const [includeDiagnostics, setIncludeDiagnostics] = React.useState(true);
    const [phase, setPhase] = React.useState<Phase>('idle');
    const [preview, setPreview] = React.useState('');
    const fileRef = React.useRef<HTMLInputElement>(null);

    const palette = light
        ? {
            surface: '#f4f5ee',
            surfaceAlt: 'rgba(49,93,67,0.06)',
            border: 'rgba(49,93,67,0.18)',
            text: '#213e34',
            muted: '#496357',
            accent: '#246e55',
            accentText: '#ffffff',
            scrim: 'rgba(12,26,21,0.42)',
        }
        : {
            surface: '#0b1512',
            surfaceAlt: 'rgba(255,255,255,0.06)',
            border: 'rgba(255,255,255,0.12)',
            text: '#e8f4ed',
            muted: 'rgba(232,244,237,0.62)',
            accent: '#8fd8bd',
            accentText: '#06231b',
            scrim: 'rgba(0,0,0,0.62)',
        };

    const draft: FeedbackDraft = { category, description, includeDiagnostics, screenshots };

    const categories: Array<{ id: FeedbackCategory; icon: React.ReactNode }> = [
        { id: 'crash', icon: <Activity size={15} aria-hidden="true" /> },
        { id: 'playback', icon: <Music4 size={15} aria-hidden="true" /> },
        { id: 'stutter', icon: <Music4 size={15} aria-hidden="true" /> },
        { id: 'lyrics', icon: <Type size={15} aria-hidden="true" /> },
        { id: 'display', icon: <Sparkles size={15} aria-hidden="true" /> },
        { id: 'rear', icon: <Activity size={15} aria-hidden="true" /> },
        { id: 'pad', icon: <Sparkles size={15} aria-hidden="true" /> },
        { id: 'local', icon: <Music4 size={15} aria-hidden="true" /> },
        { id: 'other', icon: <FileArchive size={15} aria-hidden="true" /> },
    ].filter(entry=>entry.id!=='rear'||Math.min(screen.width,screen.height)<600) as Array<{id:FeedbackCategory;icon:React.ReactNode}>;

    const handleScreenshots = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const remaining = MAX_FEEDBACK_SCREENSHOTS - screenshots.length;
        if (remaining <= 0) return;
        const next = await captureScreenshots(Array.from(files).slice(0, remaining));
        setScreenshots((current) => [...current, ...next].slice(0, MAX_FEEDBACK_SCREENSHOTS));
    };

    const handlePreview = async () => {
        setPhase('previewing');
        try {
            const text = await buildDiagnosticPreview(draft);
            setPreview(text);
            setPhase('preview');
        } catch {
            setPhase('idle');
        }
    };

    const handleExport = async () => {
        setPhase('working');
        try {
            const outcome = await exportDiagnosticPackage(draft, copy.title);
            if (outcome.status === 'shared') {
                setPhase('shared');
                return;
            }
            if (outcome.status === 'cancelled') {
                setPhase('idle');
                return;
            }
            // 桌面 / 老 WebView：退回文本报告，仍然让用户拿到内容。
            const text = await buildDiagnosticPreview(draft);
            await exportDiagnosticReport(text, copy.title);
            setPhase('shared');
        } catch {
            setPhase('failed');
        }
    };

    const busy = phase === 'working' || phase === 'previewing';

    // 只有「点在遮罩/容器空白处」才关闭。event.target === event.currentTarget 把面板
    // 内容区完全排除；面板自己再 stopPropagation 兜一道。这样 DOM 侧与原生镜像侧
    // 用的是同一套语义：内部任何点击都不会冒泡成关闭。
    const handleScrimClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[160] flex items-end justify-center sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label={copy.title}
            onClick={handleScrimClick}
        >
            {/* 纯装饰层：不能是 <button>，也不能带 onClick。原生设置文档会把每个可点
                元素编译成控件，而无 area 的控件在 Compose 里最后合成、永远盖在内容之上 ——
                一个覆盖全屏的遮罩按钮会把面板里每一次点击都变成「点遮罩 → onClose」。
                pointer-events-none 让空白处的点击落到外层容器（由 handleScrimClick 严格
                判定），aria-hidden / data-native-decoration 再各上一道采集侧保险。 */}
            <div
                aria-hidden="true"
                data-native-decoration="true"
                className="pointer-events-none absolute inset-0"
                style={{ backgroundColor: palette.scrim, backdropFilter: 'blur(6px)' }}
            />
            <div
                data-testid="feedback-panel" data-settings-layout="column" data-settings-style='{"gap":16,"font":12}'
                onClick={(event) => event.stopPropagation()}
                className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border sm:rounded-3xl"
                style={{
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    color: palette.text,
                    boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
                }}
            >
                <div className="flex items-start gap-3 px-5 pb-3 pt-5" data-settings-layout="column" data-settings-style='{"font":12,"tone":"muted"}'>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold">{copy.title}</h2>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: palette.muted }}>
                            {copy.subtitle}
                        </p>
                    </div>
                    <button
                        type="button"
                        data-testid="feedback-close"
                        onClick={onClose}
                        className="rounded-full p-2 transition-opacity hover:opacity-70"
                        style={{ backgroundColor: palette.surfaceAlt, color: palette.text }}
                        aria-label={copy.close}
                    >
                        <X size={16} />
                    </button>
                </div>

                {phase === 'preview' ? (
                    <div className="flex min-h-0 flex-1 flex-col px-5 pb-5" data-settings-layout="column" data-settings-style='{"gap":8}'>
                        <div className="mb-2 flex items-center justify-between" data-settings-layout="row" data-settings-style='{"align":"between","gap":8,"font":12}'>
                            <span className="text-sm font-semibold">{copy.previewTitle}</span>
                            <button
                                type="button"
                                onClick={() => setPhase('idle')}
                                className="flex items-center gap-1 text-xs"
                                style={{ color: palette.muted }}
                            >
                                <ChevronLeft size={14} /> {copy.previewClose}
                            </button>
                        </div>
                        <pre
                            data-testid="feedback-preview" data-settings-layout="column" data-settings-style='{"font":11,"maxHeight":280,"scroll":true,"fill":true,"radius":12,"padding":[12,12,12,12]}'
                            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 text-[11px] leading-relaxed"
                            style={{ backgroundColor: palette.surfaceAlt, color: palette.text }}
                        >
                            {preview}
                        </pre>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4" data-settings-layout="column" data-settings-style='{"gap":16}'>
                        <section data-settings-layout="column" data-settings-style='{"gap":8}'>
                            <div className="mb-2 text-xs font-semibold" style={{ color: palette.muted }}>
                                {copy.categoryLabel}
                            </div>
                            <div className="grid grid-cols-2 gap-2" data-settings-layout="grid" data-settings-style='{"columns":2,"gap":8}'>
                                {categories.map((entry) => {
                                    const active = category === entry.id;
                                    return (
                                        <button
                                            key={entry.id}
                                            type="button"
                                            data-testid={`feedback-category-${entry.id}`}
                                            aria-pressed={active} data-settings-layout="row" data-settings-style='{"gap":8,"align":"center","border":true,"radius":12,"padding":[10,10,10,10],"font":12,"minHeight":44}'
                                            onClick={() => setCategory(entry.id)}
                                            className="flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-xs font-medium transition-colors"
                                            style={{
                                                borderColor: active ? palette.accent : palette.border,
                                                backgroundColor: active ? `${palette.surfaceAlt}` : 'transparent',
                                                color: palette.text,
                                            }}
                                        >
                                            {entry.icon}
                                            <span className="min-w-0 truncate" data-settings-layout="column" data-settings-style='{"grow":true}'>{copy.categories[entry.id]}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        <section data-settings-layout="column" data-settings-style='{"gap":8}'>
                            <div className="mb-2 flex items-baseline justify-between" data-settings-layout="row" data-settings-style='{"align":"between","gap":8}'>
                                <span className="text-xs font-semibold" style={{ color: palette.muted }}>
                                    {copy.descriptionLabel}
                                </span>
                                <span className="text-[10px]" data-settings-layout="column" data-settings-style='{"font":10,"tone":"muted"}' style={{ color: palette.muted }}>
                                    {description.length}/2000
                                </span>
                            </div>
                            <textarea
                                data-testid="feedback-description" aria-label={copy.descriptionLabel} data-settings-style='{"minHeight":112,"font":14}'
                                value={description}
                                onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
                                placeholder={copy.descriptionPlaceholder}
                                rows={5}
                                className="w-full resize-none rounded-2xl border p-3 text-sm outline-none"
                                style={{
                                    borderColor: palette.border,
                                    backgroundColor: palette.surfaceAlt,
                                    color: palette.text,
                                }}
                            />
                            <p className="mt-1 text-[10px]" data-settings-layout="column" data-settings-style='{"font":11,"tone":"muted"}' style={{ color: palette.muted }}>
                                {copy.descriptionHint}
                            </p>
                        </section>

                        <section data-settings-layout="column" data-settings-style='{"gap":8}'>
                            <div className="mb-2 flex items-center justify-between" data-settings-layout="row" data-settings-style='{"align":"between","gap":8,"font":12}'>
                                <span className="text-xs font-semibold" style={{ color: palette.muted }}>
                                    {copy.screenshotsLabel}
                                </span>
                                <span className="text-[10px]" data-settings-layout="column" data-settings-style='{"font":10,"tone":"muted","grow":true}' style={{ color: palette.muted }}>
                                    {copy.screenshotLimit}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2" data-settings-layout="wrap" data-settings-style='{"gap":8}'>
                                {screenshots.map((shot, index) => (
                                    <div key={`${index}-${shot.length}`} className="relative" data-settings-layout="column" data-settings-style='{"width":64,"gap":4}'>
                                        <img
                                            src={shot}
                                            alt="" data-settings-style='{"width":64,"height":64,"radius":12}'
                                            className="h-16 w-16 rounded-xl object-cover"
                                            style={{ border: `1px solid ${palette.border}` }}
                                        />
                                        <button
                                            type="button"
                                            aria-label={copy.removeScreenshot} data-settings-style='{"height":28,"center":true}'
                                            onClick={() => setScreenshots((list) => list.filter((_, i) => i !== index))}
                                            className="absolute -right-1 -top-1 rounded-full p-1"
                                            style={{ backgroundColor: palette.surface, border: `1px solid ${palette.border}` }}
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                                {screenshots.length < MAX_FEEDBACK_SCREENSHOTS && (
                                    <button
                                        type="button"
                                        data-testid="feedback-add-screenshot" data-settings-layout="column" data-settings-style='{"width":72,"height":72,"center":true,"gap":4,"border":true,"radius":12,"font":10}'
                                        onClick={() => fileRef.current?.click()}
                                        className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border text-[10px]"
                                        style={{ borderColor: palette.border, color: palette.muted }}
                                    >
                                        <Camera size={16} />
                                        {copy.addScreenshot}
                                    </button>
                                )}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    hidden
                                    onChange={(event) => {
                                        void handleScreenshots(event.target.files);
                                        event.target.value = '';
                                    }}
                                />
                            </div>
                        </section>

                        <section
                            className="flex items-start gap-3 rounded-2xl p-3" data-settings-layout="row" data-settings-style='{"align":"start","gap":12,"radius":12,"fill":true,"padding":[12,12,12,12]}'
                            style={{ backgroundColor: palette.surfaceAlt }}
                        >
                            <button
                                type="button"
                                role="switch"
                                aria-checked={includeDiagnostics}
                                data-testid="feedback-include-diagnostics" aria-label={copy.includeDiagnostics}
                                onClick={() => setIncludeDiagnostics((value) => !value)}
                                className="mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors"
                                style={{ backgroundColor: includeDiagnostics ? palette.accent : palette.border }}
                            >
                                <span
                                    className="block h-4 w-4 rounded-full transition-transform"
                                    style={{
                                        backgroundColor: includeDiagnostics ? palette.accentText : palette.surface,
                                        transform: includeDiagnostics ? 'translateX(16px)' : 'translateX(0)',
                                    }}
                                />
                            </button>
                            <div className="min-w-0" data-settings-layout="column" data-settings-style='{"grow":true,"gap":4}'>
                                <div className="text-xs font-semibold">{copy.includeDiagnostics}</div>
                                <p className="mt-0.5 text-[10px] leading-relaxed" data-settings-layout="column" data-settings-style='{"font":11,"tone":"muted"}' style={{ color: palette.muted }}>
                                    {copy.includeDiagnosticsHint}
                                </p>
                            </div>
                        </section>

                        <CloudFeedbackSection draft={draft}/>
                        <section data-settings-layout="column" data-settings-style='{"gap":8}'>
                            <div className="text-xs font-semibold">{copy.privacyTitle}</div>
                            <p className="mt-1 text-[10px] leading-relaxed" data-settings-layout="column" data-settings-style='{"font":11,"tone":"muted"}' style={{ color: palette.muted }}>
                                {copy.privacyBody}
                            </p>
                        </section>
                    </div>
                )}

                <div
                    className="flex items-center gap-2 border-t px-5 py-3" data-settings-layout="grid" data-settings-style='{"columns":2,"gap":8,"stackBelow":360}'
                    style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                >
                    <button
                        type="button"
                        data-testid="feedback-preview-button" data-settings-style='{"border":true,"radius":12,"padding":[10,12,10,12],"center":true,"font":12}'
                        onClick={() => void handlePreview()}
                        disabled={busy}
                        className="flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-opacity disabled:opacity-50"
                        style={{ borderColor: palette.border, color: palette.text }}
                    >
                        {phase === 'previewing' ? copy.previewLoading : copy.preview}
                    </button>
                    <button
                        type="button"
                        data-testid="feedback-export-button" data-settings-layout="row" data-settings-style='{"fill":true,"tone":"accent","radius":12,"gap":8,"padding":[10,12,10,12],"center":true,"font":12}'
                        onClick={() => void handleExport()}
                        disabled={busy}
                        className="flex flex-[1.2] items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-opacity disabled:opacity-60"
                        style={{ backgroundColor: palette.accent, color: palette.accentText }}
                    >
                        {phase === 'working' ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : phase === 'shared' ? (
                            <Check size={14} />
                        ) : (
                            <Send size={14} />
                        )}
                        {phase === 'working'
                            ? copy.exportWorking
                            : phase === 'shared'
                                ? copy.exportShared
                                : phase === 'failed'
                                    ? copy.exportFailed
                                    : copy.export}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default FeedbackPanel;

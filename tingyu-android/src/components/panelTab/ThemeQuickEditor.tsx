import React, { useEffect, useMemo, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Moon, Palette, RotateCcw, Sun, X, Copy, ArrowLeft, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { DualTheme, SongResult } from '../../types';
import type { ThemeCacheSongKey } from '../../services/themeCache';
import { FALLBACK_AI_DUAL_THEME, sanitizeDualTheme } from '../../services/themeSanitizer';
import { BASE_DUAL_THEME } from '../../services/baseThemes';
import { extractColors } from '../../utils/colorExtractor';
import { THEME_GENERATION_PROMPT_PREFIX, buildThemeSourcePrompt, parseAiThemeJsonInput } from '../../utils/aiThemePrompts';
import { useThemeQuickEditorStore, type ThemeQuickEditorKind } from '../../stores/useThemeQuickEditorStore';
import { buildRecommendedColors } from '../../utils/themeEditorPalette';
import FastColorPicker from '../shared/FastColorPicker';

// src/components/panelTab/ThemeQuickEditor.tsx
// Lightweight theme color editor launched from the player controls tab.

type EditableColorKey = 'backgroundColor' | 'primaryColor' | 'accentColor' | 'secondaryColor';
type EditableMode = 'light' | 'dark';

type ColorField = {
    key: EditableColorKey;
    labelKey: string;
    fallbackLabel: string;
};

const COLOR_FIELDS: ColorField[] = [
    { key: 'backgroundColor', labelKey: 'options.aiThemeQuickEditBackground', fallbackLabel: 'Background' },
    { key: 'primaryColor', labelKey: 'options.aiThemeQuickEditPrimary', fallbackLabel: 'Primary' },
    { key: 'accentColor', labelKey: 'options.aiThemeQuickEditAccent', fallbackLabel: 'Accent' },
    { key: 'secondaryColor', labelKey: 'options.aiThemeQuickEditSecondary', fallbackLabel: 'Secondary' },
];

type ThemeQuickEditorProps = {
    presentation?: 'modal'|'page';
    paletteHint?:string;
    kind: ThemeQuickEditorKind;
    initialTheme: DualTheme;
    coverUrl: string | null;
    isDaylight: boolean;
    promptSourceText: string | null;
    isPureMusic: boolean;
    songTitle: string | undefined;
    onClose: () => void;
    onSave: (theme: DualTheme) => void;
};

const ThemeQuickEditor: React.FC<ThemeQuickEditorProps> = ({
    presentation='modal',
    paletteHint,
    kind,
    initialTheme,
    coverUrl,
    isDaylight,
    promptSourceText,
    isPureMusic,
    songTitle,
    onClose,
    onSave,
}) => {
    const { t } = useTranslation();
    const normalizedInitialTheme = useMemo(() => sanitizeDualTheme(initialTheme), [initialTheme]);
    const [draftTheme, setDraftTheme] = useState<DualTheme>(() => normalizedInitialTheme);
    const [mode, setMode] = useState<EditableMode>(() => (isDaylight ? 'light' : 'dark'));
    const [activeKey, setActiveKey] = useState<EditableColorKey>('accentColor');
    const [coverColors, setCoverColors] = useState<string[]>([]);
    const [themeNames, setThemeNames] = useState(() => ({
        light: normalizedInitialTheme.light.name || '',
        dark: normalizedInitialTheme.dark.name || '',
    }));
    const [isDragging, setIsDragging] = useState(false);
    const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
    const [importJsonText, setImportJsonText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    const [isJsonCopied, setIsJsonCopied] = useState(false);
    const isMouseDownOnOverlayRef = useRef(false);

    useEffect(() => {
        const handlePointerUp = () => setIsDragging(false);
        window.addEventListener('pointerup', handlePointerUp);
        return () => window.removeEventListener('pointerup', handlePointerUp);
    }, []);

    const handleOverlayMouseDown = (event: React.MouseEvent) => {
        isMouseDownOnOverlayRef.current = event.target === event.currentTarget;
    };

    const handleOverlayClick = (event: React.MouseEvent) => {
        if (event.target === event.currentTarget && isMouseDownOnOverlayRef.current) {
            onClose();
        }
    };

    useEffect(() => {
        setDraftTheme(normalizedInitialTheme);
        setThemeNames({
            light: normalizedInitialTheme.light.name || '',
            dark: normalizedInitialTheme.dark.name || '',
        });
        setMode(isDaylight ? 'light' : 'dark');
        setActiveKey('accentColor');
    }, [isDaylight, normalizedInitialTheme]);

    useEffect(() => {
        let cancelled = false;
        if (!coverUrl) {
            setCoverColors([]);
            return undefined;
        }

        extractColors(coverUrl, 8)
            .then(colors => {
                if (!cancelled) {
                    setCoverColors(colors);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCoverColors([]);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [coverUrl]);

    // 组件内调色板产生的必定是合法 Hex，直接跳过 sanitizeDualTheme 以节约性能
    const activeTheme = draftTheme[mode];
    const activeColor = activeTheme[activeKey];
    const recommendedColors = useMemo(
        () => buildRecommendedColors(normalizedInitialTheme, coverColors),
        [coverColors, normalizedInitialTheme],
    );

    const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingColorRef = useRef<{mode:EditableMode;key:EditableColorKey;color:string}|null>(null);
    useEffect(()=>()=>{if(throttleTimeoutRef.current)clearTimeout(throttleTimeoutRef.current);},[]);

    const updateColorThrottled = (color: string) => {
        pendingColorRef.current = {mode,key:activeKey,color};
        if (!throttleTimeoutRef.current) {
            throttleTimeoutRef.current = setTimeout(() => {
                throttleTimeoutRef.current = null;
                const pending=pendingColorRef.current;pendingColorRef.current=null;
                if(pending)setDraftTheme(previous=>({...previous,[pending.mode]:{...previous[pending.mode],[pending.key]:pending.color}}));
            }, 33); // ~30fps 刷新率
        }
    };

    // 当用户直接点击推荐颜色等需要立即响应时，清除节流并直接更新
    const flushPendingColor=()=>{
        if(throttleTimeoutRef.current)clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current=null;
        const pending=pendingColorRef.current;pendingColorRef.current=null;
        if(pending)setDraftTheme(previous=>({...previous,[pending.mode]:{...previous[pending.mode],[pending.key]:pending.color}}));
    };
    const updateColorInstant = (color: string) => {
        flushPendingColor();
        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
            throttleTimeoutRef.current = null;
        }
        setDraftTheme(previous => ({
            ...previous,
            [mode]: {
                ...previous[mode],
                [activeKey]: color,
            },
        }));
    };

    // Flushes any pending color-picker update and returns a safe, named dual theme for saving or copying.
    const buildFinalTheme = () => {
        const finalLightName = themeNames.light.trim();
        const finalDarkName = themeNames.dark.trim();
        const updatedDraft = {
            ...draftTheme,
            light: { ...draftTheme.light, name: finalLightName },
            dark: { ...draftTheme.dark, name: finalDarkName },
        };

        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
            throttleTimeoutRef.current = null;
            const pending=pendingColorRef.current;pendingColorRef.current=null;
            if(pending)updatedDraft[pending.mode]={...updatedDraft[pending.mode],[pending.key]:pending.color};
        }

        return sanitizeDualTheme(updatedDraft, normalizedInitialTheme);
    };

    const handleSave = () => {
        if (!isNameValid) return;
        onSave(buildFinalTheme());
    };

    const handleCopyThemeJson = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(buildFinalTheme(), null, 2));
            setIsJsonCopied(true);
            window.setTimeout(() => setIsJsonCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy theme JSON:', error);
        }
    };

    const handleCopyPrompt = async () => {
        try {
            const finalPrompt = THEME_GENERATION_PROMPT_PREFIX + '\n\n' + buildThemeSourcePrompt(promptSourceText || '', isPureMusic, songTitle);
            await navigator.clipboard.writeText(finalPrompt);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy prompt:', error);
        }
    };

    const handleImportApply = () => {
        setImportError(null);
        if (!importJsonText.trim()) return;
        try {
            const parsed = parseAiThemeJsonInput(importJsonText);
            const importedTheme = sanitizeDualTheme(parsed as DualTheme, normalizedInitialTheme);
            onSave(importedTheme);
            setIsImportPanelOpen(false);
            setImportJsonText('');
        } catch (error) {
            setImportError(t('options.invalidJsonFormat') || 'Invalid JSON format');
        }
    };

    const handleReset = () => {
        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
            throttleTimeoutRef.current = null;
        }
        if (kind === 'custom') {
            setDraftTheme(previous => ({
                ...previous,
                light: {
                    ...previous.light,
                    backgroundColor: BASE_DUAL_THEME.light.backgroundColor,
                    primaryColor: BASE_DUAL_THEME.light.primaryColor,
                    accentColor: BASE_DUAL_THEME.light.accentColor,
                    secondaryColor: BASE_DUAL_THEME.light.secondaryColor,
                },
                dark: {
                    ...previous.dark,
                    backgroundColor: BASE_DUAL_THEME.dark.backgroundColor,
                    primaryColor: BASE_DUAL_THEME.dark.primaryColor,
                    accentColor: BASE_DUAL_THEME.dark.accentColor,
                    secondaryColor: BASE_DUAL_THEME.dark.secondaryColor,
                },
            }));
            return;
        }
        setDraftTheme(normalizedInitialTheme);
        setThemeNames({
            light: normalizedInitialTheme.light.name || '',
            dark: normalizedInitialTheme.dark.name || '',
        });
    };

    const isThemeNameValid = (name: string) => name.trim().length > 0 && name.trim().length <= 32;
    const isNameValid = isThemeNameValid(themeNames.light) && isThemeNameValid(themeNames.dark);

    // Use activeTheme for real-time preview of the edited dual theme
    const panelBg = presentation==='page'?'var(--ui-surface, #0b261e)':activeTheme.backgroundColor;
    const textColor = presentation==='page'?'var(--text-primary)':activeTheme.primaryColor;
    const mutedTextColor = presentation==='page'?'var(--ty-settings-muted)':activeTheme.secondaryColor;
    const accentColor = presentation==='page'?'var(--ty-settings-mint)':activeTheme.accentColor;

    // Use hex alpha for backgrounds and borders based on primary text color for contrast
    const softBg = presentation==='page'?'var(--ui-subtle, #99bba50b)':`${textColor}12`; // ~7% opacity
    const hoverBg = presentation==='page'?'var(--ui-selected, #74d9ba1a)':`${textColor}1a`; // ~10% opacity
    const borderColor = presentation==='page'?'var(--ty-settings-line)':`${textColor}26`; // ~15% opacity
    const overlayBg = mode === 'light' ? 'rgba(24,24,27,0.35)' : 'rgba(0,0,0,0.65)';

    const pagePresentation=presentation==='page';
    const themeTransitionClass = pagePresentation||isDragging ? '' : 'transition-colors duration-500';
    const allTransitionClass = pagePresentation||isDragging ? '' : 'transition-all duration-300';
    const title = kind === 'custom'
        ? (t('options.customThemeQuickEditTitle') || 'Quick Edit Custom Theme')
        : (t('options.aiThemeQuickEditTitle') || 'Quick Edit AI Theme');
    const description = kind === 'custom'
        ? (t('options.customThemeQuickEditDesc') || 'Tune your custom theme colors.')
        : (t('options.aiThemeQuickEditDesc') || 'Tune the current song AI theme colors.');
    const saveLabel = kind === 'custom'
        ? (t('options.customThemeQuickEditSave') || 'Save Custom Theme')
        : (t('options.aiThemeQuickEditSave') || 'Save AI Theme');

    return (
        <motion.div
            data-native-settings-editor={pagePresentation ? undefined : true}
            initial={pagePresentation?false:{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            // 添加 transform-gpu 强制硬件加速隔离模糊计算
            data-theme-presentation={presentation}
            className={pagePresentation?"ty-rear-theme-editor":`fixed inset-0 z-[142] flex items-center justify-center p-4 backdrop-blur-sm transform-gpu ${themeTransitionClass}`}
            style={pagePresentation?undefined:{ backgroundColor: overlayBg, willChange: 'opacity' }}
            onMouseDown={handleOverlayMouseDown}
            onClick={handleOverlayClick}
         data-settings-style='{"align":"center","center":true,"padding":[16,16,16,16]}' data-settings-layout="row">
            <motion.div
                initial={pagePresentation?false:{ opacity: 0, y: 16, scale: 0.98 }}
                animate={pagePresentation?undefined:{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.985 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                // 添加 transform-gpu 隔离阴影重绘
                className={pagePresentation?"ty-rear-theme-panel":`relative w-full max-w-[36rem] overflow-hidden rounded-[1.5rem] border shadow-[0_24px_80px_rgba(0,0,0,0.4)] transform-gpu ${themeTransitionClass}`}
                style={pagePresentation?undefined:{ backgroundColor: panelBg, borderColor, color: textColor, willChange: 'transform' }}
                onClick={(event) => event.stopPropagation()}
             data-settings-style='{"border":true}' data-settings-layout="column">
                {/* Background glow effects for real-time preview */}
                {!pagePresentation&&<div
                    className={`absolute -top-32 -right-32 h-64 w-64 rounded-full blur-[90px] opacity-40 pointer-events-none transform-gpu ${themeTransitionClass}`}
                    style={{ backgroundColor: accentColor, willChange: 'background-color' }}
                 data-settings-style='{"height":256,"width":256,"radius":64,"tone":"muted"}' data-settings-layout="column" data-settings-swatch={accentColor}/>}
                {!pagePresentation&&<div
                    className={`absolute -bottom-32 -left-32 h-64 w-64 rounded-full blur-[90px] opacity-30 pointer-events-none transform-gpu ${themeTransitionClass}`}
                    style={{ backgroundColor: mutedTextColor, willChange: 'background-color' }}
                 data-settings-style='{"height":256,"width":256,"radius":64,"tone":"muted"}' data-settings-layout="column" data-settings-swatch={mutedTextColor}/>}

                <div data-settings-page-body data-settings-style='{"padding":[18,0,18,0],"gap":12}' className={pagePresentation?"ty-rear-theme-scroll":"relative z-10 transform-gpu"} data-settings-layout="column">
                    <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${themeTransitionClass}`} style={{ borderColor }} data-settings-style={JSON.stringify(pagePresentation?{align:"end",gap:12,padding:[0,0,0,8]}:{align:"between",gap:12,divider:true,padding:[20,16,20,16]})} data-settings-layout="row">
                        {!pagePresentation&&<div className="flex min-w-0 items-center gap-4" data-settings-style='{"align":"center","gap":16}' data-settings-layout="row">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${themeTransitionClass}`} style={{ backgroundColor: softBg, color: accentColor }} data-settings-style='{"align":"center","center":true,"height":40,"width":40,"radius":64}' data-settings-layout="row" data-settings-swatch={softBg}>
                                <Palette size={18} />
                            </div>
                            <div className="min-w-0" data-settings-layout="column">
                                <div className="truncate text-sm font-bold tracking-tight" data-settings-style='{"font":14,"weight":700}' data-settings-layout="column">
                                    {title}
                                </div>
                                <div className={`mt-0.5 truncate text-xs ${themeTransitionClass}`} style={{ color: mutedTextColor }} data-settings-style='{"font":12,"margin":[0,2,0,0]}' data-settings-layout="column">
                                    {description}
                                </div>
                            </div>
                        </div>}
                        <div className="flex shrink-0 items-center gap-1.5" data-settings-style='{"align":"center","gap":6}' data-settings-layout="row">
                            <button
                                type="button"
                                onClick={handleReset}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-bold transition-colors duration-300"
                                style={{ backgroundColor: 'transparent', color: mutedTextColor }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = hoverBg; e.currentTarget.style.color = textColor; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = mutedTextColor; }}
                                title={t('ui.resetToDefaultTheme') || 'Reset'}
                             data-settings-style='{"align":"center","center":true,"height":36,"gap":6,"radius":64,"font":11,"weight":700,"padding":[12,0,12,0]}' data-settings-layout="row">
                                <RotateCcw size={14} />
                                <span className="hidden sm:inline" data-settings-layout="wrap">{t('ui.resetToDefaultTheme') || 'Reset'}</span>
                            </button>
                            {!pagePresentation&&<button
                                type="button"
                                onClick={onClose}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
                                style={{ backgroundColor: 'transparent', color: mutedTextColor }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = hoverBg; e.currentTarget.style.color = textColor; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = mutedTextColor; }}
                                aria-label={t('ui.close') || 'Close'}
                             data-settings-style='{"align":"center","center":true,"height":36,"width":36,"radius":64}' data-settings-layout="row" data-settings-swatch={'transparent'}>
                                <X size={17} />
                            </button>}
                        </div>
                    </div>

                    {pagePresentation&&<p className="ty-rear-theme-hint" data-settings-style='{"font":12,"tone":"muted","margin":[0,0,0,12]}' data-settings-layout="wrap">{paletteHint??t('rearAppearance.paletteHint', {mode:t(isDaylight?'options.lightTheme':'options.darkTheme')})}</p>}
                    {isImportPanelOpen ? (
                        <div className="flex flex-col gap-6 p-6" data-settings-style='{"gap":24,"padding":[24,24,24,24]}' data-settings-layout="column">
                            <div className="space-y-4" data-settings-style='{"gap":16}' data-settings-layout="column">
                                <div className={`text-sm font-bold ${themeTransitionClass}`} style={{ color: textColor }} data-settings-style='{"font":14,"weight":700}' data-settings-layout="column">
                                    {t('aiHelp.copyPromptTitle') || '1. Copy AI Prompt'}
                                </div>
                                <div className={`text-xs ${themeTransitionClass}`} style={{ color: mutedTextColor }} data-settings-style='{"font":12}' data-settings-layout="column">
                                    {t('aiHelp.copyPromptDesc') || 'Copy the prompt and paste it into any AI model to generate your theme.'}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopyPrompt}
                                    className={`flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold hover:brightness-110 active:scale-95 ${allTransitionClass}`}
                                    style={{ borderColor, backgroundColor: softBg, color: textColor }}
                                 data-settings-style='{"align":"center","center":true,"minHeight":44,"gap":8,"radius":12,"border":true,"font":12,"weight":700,"padding":[12,8,12,8]}' data-settings-layout="row">
                                    {isCopied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                                    <span data-settings-layout="wrap">{isCopied ? (t('status.copied') || 'Copied!') : (t('aiHelp.copyPrompt') || 'Copy Prompt')}</span>
                                </button>
                            </div>

                            <div className="space-y-4" data-settings-style='{"gap":16}' data-settings-layout="column">
                                <div className={`text-sm font-bold ${themeTransitionClass}`} style={{ color: textColor }} data-settings-style='{"font":14,"weight":700}' data-settings-layout="column">
                                    {t('aiHelp.importJsonTitle') || '2. Paste JSON Result'}
                                </div>
                                <textarea
                                    value={importJsonText}
                                    onChange={(e) => setImportJsonText(e.target.value)}
                                    placeholder={t('options.pasteJsonHere') || 'Paste JSON here...'}
                                    className={`w-full h-32 rounded-xl border bg-transparent p-3 text-xs outline-none resize-none font-mono ${allTransitionClass}`}
                                    style={{ borderColor, color: textColor }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = accentColor;
                                        e.currentTarget.style.boxShadow = `0 0 0 1px ${accentColor}`;
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = borderColor;
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                    spellCheck={false}
                                 data-settings-style='{"height":128,"radius":12,"border":true,"font":12,"padding":[12,12,12,12]}' data-settings-layout="column"/>
                                {importError && (
                                    <div className="text-xs text-red-500 font-bold" data-settings-style='{"font":12,"tone":"danger","weight":700}' data-settings-layout="column">{importError}</div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 pt-2" data-settings-style='{"align":"center","gap":12,"padding":[0,8,0,0]}' data-settings-layout="row">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsImportPanelOpen(false);
                                        setImportJsonText('');
                                        setImportError(null);
                                    }}
                                    className={`flex flex-1 min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold hover:brightness-110 active:scale-95 ${allTransitionClass}`}
                                    style={{ borderColor, backgroundColor: softBg, color: textColor }}
                                 data-settings-style='{"align":"center","center":true,"grow":true,"minHeight":44,"gap":8,"radius":12,"border":true,"font":12,"weight":700,"padding":[12,8,12,8]}' data-settings-layout="row">
                                    <ArrowLeft size={15} />
                                    <span data-settings-layout="wrap">{t('ui.cancel') || 'Cancel'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleImportApply}
                                    disabled={!importJsonText.trim()}
                                    className={`flex flex-1 min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${allTransitionClass}`}
                                    style={{ backgroundColor: accentColor, color: panelBg }}
                                 data-settings-style='{"align":"center","center":true,"grow":true,"minHeight":44,"gap":8,"radius":12,"font":12,"weight":700,"padding":[12,8,12,8]}' data-settings-layout="row">
                                    <Download size={16} strokeWidth={2.5} />
                                    <span data-settings-layout="wrap">{t('ui.apply') || 'Apply'}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_14rem]" data-settings-style={JSON.stringify({gap:20,padding:pagePresentation?[0,12,0,0]:[20,20,20,20]})} data-settings-layout="grid">
                            <div className="space-y-5" data-settings-style='{"gap":20}' data-settings-layout="column">
                                {/* Mode Switcher */}
                                <div className={`flex gap-2 rounded-2xl p-1.5 ${themeTransitionClass}`} style={{ backgroundColor: softBg }} data-settings-style='{"gap":8,"radius":16,"padding":[6,6,6,6]}' data-settings-layout="row">
                                    {(['light', 'dark'] as EditableMode[]).map(nextMode => {
                                        const selected = mode === nextMode;
                                        return (
                                            <button
                                                key={nextMode}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => {flushPendingColor();setMode(nextMode);}}
                                                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${allTransitionClass}`}
                                                style={{
                                                    backgroundColor: selected ? accentColor : 'transparent',
                                                    color: selected ? panelBg : textColor,
                                                    boxShadow: selected ? (pagePresentation?'none':`0 4px 12px ${accentColor}40`) : 'none',
                                                }}
                                             data-settings-style='{"align":"center","center":true,"grow":true,"gap":8,"radius":12,"font":12,"weight":700,"padding":[12,10,12,10]}' data-settings-layout="row">
                                                {nextMode === 'light' ? <Sun size={15} /> : <Moon size={15} />}
                                                <span data-settings-layout="wrap">{pagePresentation?t(nextMode==='light'?'rearAppearance.editLight':'rearAppearance.editDark'):nextMode === 'light' ? (t('options.lightTheme') || 'Light Theme') : (t('options.darkTheme') || 'Dark Theme')}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Color Fields */}
                                <div className="grid grid-cols-2 gap-3" data-settings-style='{"columns":2,"gap":12}' data-settings-layout="grid">
                                    {COLOR_FIELDS.map(field => {
                                        const color = draftTheme[mode][field.key];
                                        const selected = activeKey === field.key;
                                        return (
                                            <button
                                                key={field.key}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => {flushPendingColor();setActiveKey(field.key);}}
                                                className={`min-w-0 rounded-2xl border p-3.5 text-left ${allTransitionClass}`}
                                                style={{
                                                    borderColor: selected ? accentColor : borderColor,
                                                    backgroundColor: selected ? (pagePresentation?hoverBg:`${accentColor}1a`) : softBg,
                                                    boxShadow: selected ? `0 0 0 1px ${accentColor}` : 'none',
                                                }}
                                             data-settings-style='{"radius":16,"border":true,"padding":[14,14,14,14]}' data-settings-layout="column">
                                                <div className="flex items-center gap-2.5" data-settings-style='{"align":"center","gap":10}' data-settings-layout="row">
                                                    <span className={`h-6 w-6 shrink-0 rounded-full border shadow-inner ${themeTransitionClass}`} style={{ backgroundColor: color, borderColor: borderColor }}  data-settings-style='{"height":24,"width":24,"radius":64,"border":true}' data-settings-layout="card" data-settings-swatch={color}/>
                                                    <span className="min-w-0 truncate text-xs font-bold" data-settings-style='{"font":12,"weight":700}' data-settings-layout="wrap">
                                                        {t(field.labelKey) || field.fallbackLabel}
                                                    </span>
                                                </div>
                                                <div className={`mt-2.5 truncate font-mono text-[10px] uppercase tracking-wider ${themeTransitionClass}`} style={{ color: mutedTextColor }} data-settings-style='{"font":10,"margin":[0,10,0,0]}' data-settings-layout="column">
                                                    {color}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Color Picker */}
                                <div
                                    className={`rounded-3xl border p-4 transform-gpu ${themeTransitionClass}`}
                                    style={{ borderColor, backgroundColor: softBg }}
                                 data-settings-style='{"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                                    <FastColorPicker
                                        key={`${mode}:${activeKey}`}
                                        visibleHueSelection
                                        color={activeColor}
                                        onChange={updateColorThrottled}
                                        onPointerDown={() => setIsDragging(true)}
                                    />
                                </div>
                            </div>

                            <div className="flex min-w-0 flex-col gap-4" data-settings-style='{"gap":16}' data-settings-layout="column">
                                {/* Recommended Colors */}
                                <div className={`rounded-3xl border p-4 ${themeTransitionClass}`} style={{ borderColor, backgroundColor: softBg }} data-settings-style='{"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                                    <div className={`text-xs font-bold mb-3 ${themeTransitionClass}`} style={{ color: textColor }} data-settings-style='{"font":12,"weight":700,"margin":[0,0,0,12]}' data-settings-layout="column">
                                        {t('options.aiThemeQuickEditRecommendedColors') || 'Recommended Colors'}
                                    </div>
                                    <div className="grid grid-cols-4 gap-2.5" data-settings-style='{"columns":4,"gap":10}' data-settings-layout="grid">
                                        {recommendedColors.map(color => (
                                            <button
                                                key={color}
                                                type="button"
                                                onClick={() => updateColorInstant(color)}
                                                className="aspect-square rounded-xl border shadow-sm transition-transform hover:scale-110 active:scale-95"
                                                style={{ backgroundColor: color, borderColor: borderColor }}
                                                title={color.toUpperCase()}
                                                aria-label={color.toUpperCase()}
                                             data-settings-style='{"aspect":1,"radius":12,"border":true}' data-settings-layout="row" data-settings-swatch={color}/>
                                        ))}
                                    </div>
                                </div>

                                {/* Theme Rename */}
                                <div className={`rounded-3xl border p-4 ${themeTransitionClass}`} style={{ borderColor, backgroundColor: softBg }} data-settings-style='{"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                                    <div className={`text-xs font-bold mb-3 ${themeTransitionClass}`} style={{ color: textColor }} data-settings-style='{"font":12,"weight":700,"margin":[0,0,0,12]}' data-settings-layout="column">
                                        {t('options.themeName') || 'Theme Name'}
                                    </div>
                                    <label className="block" data-settings-layout="wrap">
                                        <span className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase ${themeTransitionClass}`} style={{ color: mutedTextColor }} data-settings-style='{"align":"center","gap":6,"font":10,"weight":700,"margin":[0,0,0,6]}' data-settings-layout="row">
                                            {mode === 'light' ? <Sun size={12} /> : <Moon size={12} />}
                                            {mode === 'light'
                                                ? (t('options.lightTheme') || 'Light Theme')
                                                : (t('options.darkTheme') || 'Dark Theme')}
                                        </span>
                                        <input
                                            type="text"
                                            value={themeNames[mode]}
                                            maxLength={32}
                                            onChange={(e) => setThemeNames(previous => ({
                                                ...previous,
                                                [mode]: e.target.value,
                                            }))}
                                            className={`w-full rounded-xl border bg-transparent px-4 py-2.5 text-xs font-bold outline-none ${allTransitionClass}`}
                                            style={{ borderColor, color: textColor }}
                                            onFocus={(e) => {
                                                e.currentTarget.style.borderColor = accentColor;
                                                e.currentTarget.style.boxShadow = `0 0 0 1px ${accentColor}`;
                                            }}
                                            onBlur={(e) => {
                                                e.currentTarget.style.borderColor = borderColor;
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                            placeholder={t('ui.enterThemeName')}
                                            spellCheck={false}
                                         data-settings-style='{"radius":12,"border":true,"font":12,"weight":700,"padding":[16,10,16,10]}' data-settings-layout="column"/>
                                    </label>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2 mt-auto pt-2" data-settings-style='{"gap":8,"padding":[0,8,0,0]}' data-settings-layout="column">
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        disabled={!isNameValid}
                                        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${allTransitionClass}`}
                                        style={{
                                            backgroundColor: accentColor,
                                            color: panelBg,
                                            opacity: isNameValid ? 1 : 0.5,
                                        }}
                                     data-settings-style='{"align":"center","center":true,"minHeight":44,"gap":8,"radius":12,"font":12,"weight":700,"padding":[12,8,12,8]}' data-settings-layout="row">
                                        <Check size={16} strokeWidth={2.5} />
                                        <span data-settings-layout="wrap">{saveLabel}</span>
                                    </button>
                                    <div className="flex gap-2" data-settings-style='{"gap":8}' data-settings-layout="row">
                                        <button
                                            type="button"
                                            onClick={() => void handleCopyThemeJson()}
                                            disabled={!isNameValid}
                                            className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[11px] font-bold hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${allTransitionClass}`}
                                            style={{ backgroundColor: 'transparent', color: mutedTextColor }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                         data-settings-style='{"align":"center","center":true,"grow":true,"minHeight":36,"gap":6,"radius":12,"font":11,"weight":700}' data-settings-layout="row">
                                            {isJsonCopied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                                            <span data-settings-layout="wrap">{isJsonCopied ? (t('status.copied') || 'Copied!') : (t('options.copyThemeJson') || 'Copy JSON')}</span>
                                        </button>
                                        {kind === 'ai' && (
                                            <button
                                            type="button"
                                            onClick={() => setIsImportPanelOpen(true)}
                                            className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[11px] font-bold hover:brightness-110 active:scale-95 ${allTransitionClass}`}
                                            style={{ backgroundColor: 'transparent', color: mutedTextColor }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                         data-settings-style='{"align":"center","center":true,"grow":true,"minHeight":36,"gap":6,"radius":12,"font":11,"weight":700}' data-settings-layout="row">
                                            <Download size={13} />
                                            <span data-settings-layout="wrap">{t('options.manualImportAiTheme') || 'Manual Import'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

type ThemeQuickEditorHostProps = {
    onSaveAiTheme: (theme: DualTheme, song: SongResult | null, songKey: ThemeCacheSongKey | null) => void;
    onSaveCustomTheme: (theme: DualTheme) => void;
};

const ThemeQuickEditorHost: React.FC<ThemeQuickEditorHostProps> = ({ onSaveAiTheme, onSaveCustomTheme }) => {
    const { isOpen, editorKind, aiTheme, customTheme, coverUrl, isDaylight, song, songKey, closeEditor, promptSourceText, isPureMusic, songTitle } = useThemeQuickEditorStore(useShallow(state => ({
        isOpen: state.isOpen,
        editorKind: state.editorKind,
        aiTheme: state.aiTheme,
        customTheme: state.customTheme,
        coverUrl: state.coverUrl,
        isDaylight: state.isDaylight,
        song: state.song,
        songKey: state.songKey,
        promptSourceText: state.promptSourceText,
        isPureMusic: state.isPureMusic,
        songTitle: state.songTitle,
        closeEditor: state.closeEditor,
    })));
    const initialTheme = editorKind === 'custom' ? customTheme : (aiTheme ?? FALLBACK_AI_DUAL_THEME);

    return (
        <AnimatePresence>
            {isOpen && editorKind && initialTheme && (
                <ThemeQuickEditor
                    kind={editorKind}
                    initialTheme={initialTheme}
                    coverUrl={coverUrl}
                    isDaylight={isDaylight}
                    promptSourceText={promptSourceText}
                    isPureMusic={isPureMusic}
                    songTitle={songTitle}
                    onClose={closeEditor}
                    onSave={(theme) => {
                        if (editorKind === 'custom') {
                            onSaveCustomTheme(theme);
                        } else {
                            onSaveAiTheme(theme, song, songKey);
                        }
                        closeEditor();
                    }}
                />
            )}
        </AnimatePresence>
    );
};

export {ThemeQuickEditor};
export default ThemeQuickEditorHost;

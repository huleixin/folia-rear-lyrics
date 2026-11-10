import SettingsPresence from './settings/SettingsPresence';
import {NATIVE_FIRST} from '../../services/nativePages';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import type { LyricData } from '../../types';
import { getLyricFilterError } from '../../utils/lyrics/filtering';
import { getLyricStaffPatternError } from '../../utils/lyrics/staffCredits';
import type { LyricStaffAbsorbMode, LyricStaffPolicy } from '../../utils/lyrics/staffCreditsPolicy';
import { buildLyricFilterPreviewModel } from './lyric-filter/buildLyricFilterPreviewModel';
import LyricFilterPreviewList from './lyric-filter/LyricFilterPreviewList';
import LyricFilterRuleSection from './lyric-filter/LyricFilterRuleSection';
import LyricStaffSection from './lyric-filter/LyricStaffSection';

// src/components/modal/LyricFilterSettingsModal.tsx

export interface LyricFilterDraft {
    pattern: string;
    filterEnabled: boolean;
    staffPolicy: LyricStaffPolicy;
    staffMinDwellSeconds: number;
    staffAbsorbMode: LyricStaffAbsorbMode;
    staffPattern: string;
}

interface LyricFilterSettingsModalProps {
    isOpen: boolean;
    isDaylight: boolean;
    currentSongTitle?: string | null;
    initialPattern: string;
    initialFilterEnabled: boolean;
    initialStaffPolicy: LyricStaffPolicy;
    initialStaffMinDwellSeconds: number;
    initialStaffAbsorbMode: LyricStaffAbsorbMode;
    initialStaffPattern: string;
    loadPreviewLyrics: () => Promise<LyricData | null>;
    onClose: () => void;
    onSave: (draft: LyricFilterDraft) => Promise<void> | void;
}

const shellTransition = {
    duration: 0.28,
    ease: [0.22, 1, 0.36, 1] as const,
};

const panelMotion = {
    initial: { y: 24, opacity: 0, scale: 0.985 },
    animate: { y: 0, opacity: 1, scale: 1 },
    exit: { y: 24, opacity: 0, scale: 0.985 },
};

const LyricFilterSettingsModal: React.FC<LyricFilterSettingsModalProps> = ({
    isOpen,
    isDaylight,
    currentSongTitle,
    initialPattern,
    initialFilterEnabled,
    initialStaffPolicy,
    initialStaffMinDwellSeconds,
    initialStaffAbsorbMode,
    initialStaffPattern,
    loadPreviewLyrics,
    onClose,
    onSave,
}) => {
    const { t } = useTranslation();
    const [draftPattern, setDraftPattern] = useState(initialPattern);
    const [isFilterEnabled, setIsFilterEnabled] = useState(initialFilterEnabled);
    const [draftStaffPolicy, setDraftStaffPolicy] = useState<LyricStaffPolicy>(initialStaffPolicy);
    const [draftStaffMinDwell, setDraftStaffMinDwell] = useState(initialStaffMinDwellSeconds);
    const [draftStaffAbsorbMode, setDraftStaffAbsorbMode] = useState<LyricStaffAbsorbMode>(initialStaffAbsorbMode);
    const [draftStaffPattern, setDraftStaffPattern] = useState(initialStaffPattern);
    const [previewLyrics, setPreviewLyrics] = useState<LyricData | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setDraftPattern(initialPattern);
        setIsFilterEnabled(initialFilterEnabled);
        setDraftStaffPolicy(initialStaffPolicy);
        setDraftStaffMinDwell(initialStaffMinDwellSeconds);
        setDraftStaffAbsorbMode(initialStaffAbsorbMode);
        setDraftStaffPattern(initialStaffPattern);
        setIsLoadingPreview(true);
        let active = true;

        loadPreviewLyrics()
            .then((lyrics) => {
                if (active) {
                    setPreviewLyrics(lyrics);
                }
            })
            .catch(() => {
                // Offline preview failure must not reject the entire editor's open operation.
                if(active)setPreviewLyrics(null);
            })
            .finally(() => {
                if (active) {
                    setIsLoadingPreview(false);
                }
            });

        return () => {
            active = false;
        };
    }, [
        initialPattern,
        initialFilterEnabled,
        initialStaffMinDwellSeconds,
        initialStaffAbsorbMode,
        initialStaffPattern,
        initialStaffPolicy,
        isOpen,
        loadPreviewLyrics,
    ]);

    const effectivePattern = isFilterEnabled ? draftPattern : '';
    const error = isFilterEnabled ? getLyricFilterError(draftPattern) : null;
    // 只在自定义规则输入框可见时校验：切到「始终显示」后输入框和报错都会收起来，
    // 再拿它禁用保存按钮，用户就只剩「切回去清空」这一条路。
    const staffPatternError = draftStaffPolicy === 'keep' ? null : getLyricStaffPatternError(draftStaffPattern);
    const preview = useMemo(
        () => buildLyricFilterPreviewModel(previewLyrics, effectivePattern, {
            policy: draftStaffPolicy,
            minDwellSeconds: draftStaffMinDwell,
            absorbMode: draftStaffAbsorbMode,
            pattern: draftStaffPattern,
        }),
        [draftStaffAbsorbMode, draftStaffMinDwell, draftStaffPattern, draftStaffPolicy, effectivePattern, previewLyrics]
    );

    const glassBg = isDaylight ? 'bg-white/70' : 'bg-black/40';
    const borderColor = isDaylight ? 'border-black/5' : 'border-white/10';
    const overlayBackground = isDaylight ? 'rgba(244, 244, 245, 0.9)' : 'rgba(10, 10, 12, 0.82)';
    const mutedText = isDaylight ? 'text-zinc-500' : 'text-white/50';

    const handleSave = async () => {
        if (error || staffPatternError) {
            return;
        }

        setIsSaving(true);
        try {
            await onSave({
                pattern: draftPattern.trim(),
                filterEnabled: isFilterEnabled,
                staffPolicy: draftStaffPolicy,
                staffMinDwellSeconds: draftStaffMinDwell,
                staffAbsorbMode: draftStaffAbsorbMode,
                staffPattern: draftStaffPattern.trim(),
            });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SettingsPresence>
            {isOpen && (
                <motion.div
                    data-native-settings-editor
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={shellTransition}
                    className="fixed inset-0 z-[140] backdrop-blur-xl p-3 sm:p-5"
                    style={{ backgroundColor: overlayBackground }}
                    onClick={onClose}
                 data-settings-style='{"padding":[12,12,12,12]}' data-settings-layout="column">
                    <motion.div
                        {...(NATIVE_FIRST?{initial:false,animate:{opacity:1,y:0,scale:1}}:panelMotion)}
                        transition={shellTransition}
                        className={`mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[32px] border ${borderColor} ${glassBg} shadow-[0_24px_80px_rgba(0,0,0,0.28)]`}
                        onClick={(event) => event.stopPropagation()}
                     data-settings-style='{"radius":32,"border":true}' data-settings-layout="card">
                        <div data-native-settings-header className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6" data-settings-style='{"align":"between","divider":true,"padding":[16,16,16,16]}' data-settings-layout="row">
                            <div className="flex min-w-0 items-center gap-3" data-settings-style='{"align":"center","gap":12,"grow":true}' data-settings-layout="row">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="h-10 w-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center transition-colors hover:bg-white/10"
                                    style={{ color: 'var(--text-primary)' }}
                                 data-settings-style='{"align":"center","center":true,"height":40,"width":40,"radius":64,"border":true,"fill":true,"tone":"text"}' data-settings-layout="row">
                                    <ChevronLeft size={18} />
                                </button>
                                <div className="min-w-0" data-settings-layout="column">
                                    <div data-settings-page-title className="truncate text-lg font-semibold sm:text-xl" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":18,"weight":600,"tone":"text"}' data-settings-layout="column">
                                        {t('lyricFilter.title')}
                                    </div>
                                    <div className={`mt-1 text-xs ${mutedText}`} data-settings-style='{"font":12,"margin":[0,4,0,0]}' data-settings-layout="column">
                                        {currentSongTitle ? t('lyricFilter.previewCurrentSong', { title: currentSongTitle }) : t('lyricFilter.previewFallback')}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2" data-settings-style='{"align":"center","gap":8}' data-settings-layout="row">
                                <button
                                    type="button"
                                    onClick={() => setDraftPattern('')}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors hover:bg-white/10"
                                    style={{ color: 'var(--text-primary)' }}
                                 data-settings-style='{"align":"center","gap":8,"radius":64,"border":true,"fill":true,"font":14,"padding":[12,8,12,8],"tone":"text"}' data-settings-layout="row">
                                    <RotateCcw size={14} />
                                    <span data-settings-layout="wrap">{t('lyricFilter.clear')}</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={Boolean(error) || Boolean(staffPatternError) || isSaving}
                                    onClick={handleSave}
                                    className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/15 disabled:opacity-50"
                                    style={{ color: 'var(--text-primary)' }}
                                 data-settings-style='{"radius":64,"border":true,"fill":true,"font":14,"weight":500,"padding":[16,8,16,8],"tone":"text"}' data-settings-layout="row">
                                    {isSaving ? t('lyricFilter.saving') : t('lyricFilter.save')}
                                </button>
                            </div>
                        </div>

                        <div data-settings-page-body className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[1.15fr_0.85fr]" data-settings-style='{"grow":true,"gap":0}' data-settings-layout="grid">
                            <div className={`flex min-h-0 flex-col border-b ${borderColor} lg:border-b-0 lg:border-r`} data-settings-style='{"minHeight":0,"divider":true}' data-settings-layout="column">
                                <div className="flex items-center justify-between px-4 py-4 sm:px-6" data-settings-style='{"align":"between","padding":[16,16,16,16]}' data-settings-layout="row">
                                    <div data-settings-style='{"grow":true}' data-settings-layout="column">
                                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                            {t('lyricFilter.preview')}
                                        </div>
                                        <div className={`mt-1 text-xs ${mutedText}`} data-settings-style='{"font":12,"margin":[0,4,0,0]}' data-settings-layout="column">
                                            {preview.totalCount > 0
                                                ? t('lyricFilter.filteredCount', { removed: preview.removedCount, total: preview.totalCount })
                                                : t('lyricFilter.noLyricsToPreview')}
                                        </div>
                                    </div>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6" data-settings-style='{"grow":true,"minHeight":0,"padding":[16,0,16,20]}' data-settings-layout="column">
                                    <LyricFilterPreviewList
                                        isDaylight={isDaylight}
                                        isLoading={isLoadingPreview}
                                        rows={preview.rows}
                                    />
                                </div>
                            </div>

                            <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-5 sm:px-6" data-settings-style='{"minHeight":0,"gap":16,"padding":[16,20,16,20]}' data-settings-layout="column">
                                <LyricFilterRuleSection
                                    isDaylight={isDaylight}
                                    isEnabled={isFilterEnabled}
                                    pattern={draftPattern}
                                    error={error}
                                    onToggle={() => setIsFilterEnabled(previous => !previous)}
                                    onPatternChange={setDraftPattern}
                                />
                                <LyricStaffSection
                                    isDaylight={isDaylight}
                                    policy={draftStaffPolicy}
                                    minDwellSeconds={draftStaffMinDwell}
                                    absorbMode={draftStaffAbsorbMode}
                                    pattern={draftStaffPattern}
                                    decision={preview.staff}
                                    onPolicyChange={setDraftStaffPolicy}
                                    onMinDwellChange={setDraftStaffMinDwell}
                                    onAbsorbModeChange={setDraftStaffAbsorbMode}
                                    onPatternChange={setDraftStaffPattern}
                                />
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </SettingsPresence>
    );
};

export default LyricFilterSettingsModal;

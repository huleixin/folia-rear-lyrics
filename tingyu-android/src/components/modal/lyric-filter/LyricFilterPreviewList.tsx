import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { LyricFilterPreviewRow } from './buildLyricFilterPreviewModel';

// src/components/modal/lyric-filter/LyricFilterPreviewList.tsx

interface LyricFilterPreviewListProps {
    isDaylight: boolean;
    isLoading: boolean;
    rows: LyricFilterPreviewRow[];
}

const LyricFilterPreviewList: React.FC<LyricFilterPreviewListProps> = ({ isDaylight, isLoading, rows }) => {
    const { t } = useTranslation();
    const mutedText = isDaylight ? 'text-zinc-500' : 'text-white/50';

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center" data-settings-style='{"align":"center","center":true}' data-settings-layout="row">
                <Loader2 className={`animate-spin ${mutedText}`} size={28} />
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className={`flex h-full items-center justify-center text-sm ${mutedText}`} data-settings-style='{"align":"center","center":true,"font":14}' data-settings-layout="row">
                {t('lyricFilter.emptyContent')}
            </div>
        );
    }

    const firstStaffIndex = rows.find(row => row.isStaff)?.index ?? null;

    return (
        <div className="space-y-4 py-4 text-center" data-settings-style='{"gap":16,"center":true,"padding":[0,16,0,16]}' data-settings-layout="column">
            {rows.map(({ line, index, removedByFilter, isStaff, removedByStaff }) => {
                const removed = removedByFilter || removedByStaff;

                return (
                    <div key={`${index}-${line.startTime}-${line.fullText}`} className="px-3 transition-colors" data-settings-style='{"padding":[12,0,12,0]}' data-settings-layout="column">
                        <div className="flex flex-col items-center gap-1" data-settings-style='{"align":"center","gap":4}' data-settings-layout="column">
                            {/* 署名块只在第一条上打一次标，逐行重复会把预览变成噪音。 */}
                            {isStaff && index === firstStaffIndex && (
                                <div className={`text-[10px] uppercase tracking-wide ${mutedText}`} data-settings-style='{"font":10}' data-settings-layout="column">
                                    {t('lyricStaff.title')}
                                </div>
                            )}
                            <div
                                className={`min-w-0 text-sm ${removed ? 'line-through opacity-55' : ''} ${
                                    isStaff && !removed ? 'opacity-80' : ''
                                }`}
                                style={{ color: 'var(--text-primary)' }}
                             data-settings-style='{"font":14,"tone":"text"}' data-settings-layout="column">
                                {line.fullText}
                            </div>
                        </div>
                        {line.translation && (
                            <div className={`mt-1 text-xs ${removed ? 'line-through opacity-45' : mutedText}`} data-settings-style='{"font":12,"margin":[0,4,0,0]}' data-settings-layout="column">
                                {line.translation}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default LyricFilterPreviewList;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { LYRIC_FILTER_REGEX_EXAMPLE } from '../../../utils/lyrics/filtering';

// src/components/modal/lyric-filter/LyricFilterRuleSection.tsx

interface LyricFilterRuleSectionProps {
    isDaylight: boolean;
    isEnabled: boolean;
    pattern: string;
    error: string | null;
    onToggle: () => void;
    onPatternChange: (pattern: string) => void;
}

const LyricFilterRuleSection: React.FC<LyricFilterRuleSectionProps> = ({
    isDaylight,
    isEnabled,
    pattern,
    error,
    onToggle,
    onPatternChange,
}) => {
    const { t } = useTranslation();
    const cardBg = isDaylight ? 'bg-black/[0.03]' : 'bg-white/[0.04]';
    const borderColor = isDaylight ? 'border-black/5' : 'border-white/10';
    const inputBg = isDaylight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10';
    const mutedText = isDaylight ? 'text-zinc-500' : 'text-white/50';
    const dangerText = isDaylight ? 'text-red-600' : 'text-red-300';
    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-300/90' : 'bg-white/10';

    return (
        <div className={`rounded-[24px] border p-4 ${cardBg} ${borderColor}`} data-settings-style='{"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
            {/* 开关必须留在这张卡里：它只管这条正则，放到面板顶部会被读成整个歌词过滤的总开关。 */}
            <div className="flex items-start justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                <div className="min-w-0" data-settings-style='{"grow":true}' data-settings-layout="column">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                        {t('lyricFilter.ruleSectionTitle')}
                    </div>
                    <div className={`mt-1 text-xs ${mutedText}`} data-settings-style='{"font":12,"margin":[0,4,0,0]}' data-settings-layout="column">
                        {t('lyricFilter.regexDescription')}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={t('lyricFilter.enableFilter')}
                    role="switch"
                    aria-checked={isEnabled}
                    className={`mt-0.5 h-6 w-12 shrink-0 rounded-full p-1 transition-colors ${!isEnabled ? toggleOffBackgroundClass : ''}`}
                    style={{ backgroundColor: isEnabled ? 'var(--text-secondary)' : undefined }}
                 data-settings-style='{"height":24,"width":48,"radius":64,"padding":[4,4,4,4],"margin":[0,2,0,0]}' data-settings-layout="column" data-settings-swatch={isEnabled ? 'var(--text-secondary)' : undefined}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                </button>
            </div>
            <textarea
                value={pattern}
                onChange={(event) => onPatternChange(event.target.value)}
                placeholder={t('lyricFilter.inputPlaceholder')}
                disabled={!isEnabled}
                rows={3}
                className={`mt-4 w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${inputBg}`}
                style={{ color: 'var(--text-primary)' }}
             data-settings-style='{"radius":16,"border":true,"font":14,"padding":[16,12,16,12],"margin":[0,16,0,0],"tone":"text","minHeight":81}' data-settings-layout="column"/>
            <div className="mt-3 px-1 text-xs" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"padding":[4,0,4,0],"margin":[0,12,0,0],"tone":"muted"}' data-settings-layout="column">
                {t('lyricFilter.example')} <code data-settings-layout="column">{LYRIC_FILTER_REGEX_EXAMPLE}</code>
            </div>
            {error && (
                <div className={`mt-3 text-xs ${dangerText}`} data-settings-style='{"font":12,"margin":[0,12,0,0]}' data-settings-layout="column">
                    {t('lyricFilter.invalidRegex', { error })}
                </div>
            )}
        </div>
    );
};

export default LyricFilterRuleSection;

import React, { useEffect, useMemo, useState } from 'react';
import { Flame, Heart, Mic, Clock, Sparkles, SlidersHorizontal, Plus, Trash2, Eye, Check, Info } from 'lucide-react';
import MobileSheet from '../../../../components/shared/MobileSheet';
import { useLibraryOrganization } from '../../../core/state/useLibraryOrganization';
import {
    SMART_TEMPLATES,
    buildRuleFromTemplate,
    evaluateSmartPlaylist,
    isTemplateSupported,
    type SmartCandidate,
    type SmartCondition,
    type SmartField,
    type SmartRule,
    type SmartTemplateId,
} from '../../../core/model/smartPlaylists';
import type { ListeningSessionRecord } from '../../../../types/listeningStatistics';
import { omni } from '../../../../services/onlineMusic/omni';
import { parseDay } from '../../../core/model/listeningRange';
import { useSheetThemeTokens } from './sheetThemeTokens';

// src/library/suites/mobile/native/SmartRuleEditor.tsx
const NUMERIC_FIELDS: SmartField[] = ['plays', 'seconds', 'duration', 'lastPlayed', 'addedAt'];
const EXPOSED_FIELDS: SmartField[] = ['artist', 'album', 'name', 'source', 'liked', 'plays', 'lastPlayed', 'addedAt', 'quality'];

const FIELD_LABELS: Record<SmartField, string> = {
    artist: '歌手',
    album: '专辑',
    name: '歌曲名称',
    source: '音乐来源',
    liked: '收藏状态',
    plays: '播放次数',
    seconds: '有效收听秒数',
    lastPlayed: '最近播放时间',
    addedAt: '收藏/添加时间',
    quality: '音质规格',
    duration: '歌曲时长(秒)',
    folder: '本地目录',
    tag: '标签',
};

const OP_LABELS: Record<SmartCondition['op'], string> = {
    contains: '包含',
    is: '等于',
    gte: '大于等于',
    lte: '早于/小于等于',
};

const SORT_OPTIONS: Array<{ value: SmartRule['sort']; label: string }> = [
    { value: 'plays', label: '播放次数' },
    { value: 'lastPlayed', label: '最近播放' },
    { value: 'addedAt', label: '收藏时间' },
    { value: 'name', label: '歌曲名称' },
    { value: 'random', label: '随机排序' },
];

const LIMIT_PRESETS = [30, 50, 100, 200] as const;

function newRuleId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const newSmartRule = (name = '百听不厌'): SmartRule =>
    buildRuleFromTemplate('most_played', { id: 'custom:' + newRuleId(), name });

function TemplateIcon({ name, color }: { name: string; color: string }) {
    const props = { size: 24, strokeWidth: 1.9, color };
    switch (name) {
        case 'flame': return <Flame {...props} />;
        case 'heart': return <Heart {...props} />;
        case 'mic': return <Mic {...props} />;
        case 'clock': return <Clock {...props} />;
        case 'sparkles': return <Sparkles {...props} />;
        default: return <SlidersHorizontal {...props} />;
    }
}

function conditionSummary(condition: SmartCondition): string {
    const fieldLabel = FIELD_LABELS[condition.field] ?? condition.field;
    const opLabel = condition.field === 'lastPlayed' && condition.op === 'lte'
        ? '早于'
        : condition.op === 'gte' && condition.field === 'plays'
            ? '不少于'
            : OP_LABELS[condition.op];
    let val = String(condition.value);
    if (condition.field === 'source') val = omni.getProviderLabel(String(condition.value), false);
    else if (condition.field === 'liked') val = condition.value ? '已收藏' : '未收藏';
    else if (condition.field === 'lastPlayed' || condition.field === 'addedAt') {
        val = new Date(Number(condition.value)).toLocaleDateString();
    } else if (condition.field === 'plays') {
        val = `${condition.value} 次`;
    }
    return `${fieldLabel} ${opLabel} ${val}`;
}

function valueHintFor(field: SmartField): string {
    switch (field) {
        case 'artist': return '输入歌手名称，如：林俊杰';
        case 'album': return '输入专辑名称';
        case 'name': return '输入歌曲名称关键词';
        case 'plays': return '输入播放次数，如：5';
        case 'lastPlayed':
        case 'addedAt': return '输入天数（如 30 表示30天前）或 YYYY-MM-DD';
        case 'quality': return '如：lossless / hires / master';
        default: return '输入要匹配的内容';
    }
}

export default function SmartRuleEditor({
    rule,
    onChange,
    onClose,
    candidates,
    sessions,
    onPreview,
}: {
    rule: SmartRule | null;
    onChange: (rule: SmartRule) => void;
    onClose: () => void;
    candidates: SmartCandidate[];
    sessions: ListeningSessionRecord[];
    onPreview: (rule: SmartRule) => void;
}) {
    const store = useLibraryOrganization();
    const tokens = useSheetThemeTokens();
    const isEditing = Boolean(rule && store.rules.some(item => item.id === rule.id));
    const [templateId, setTemplateId] = useState<SmartTemplateId>('most_played');
    const [artistInput, setArtistInput] = useState('');
    const [field, setField] = useState<SmartField>('artist');
    const [op, setOp] = useState<SmartCondition['op']>('contains');
    const [valueInput, setValueInput] = useState('');
    const [customLimit, setCustomLimit] = useState('30');
    const [scopeDetailOpen, setScopeDetailOpen] = useState(false);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [debouncedRule, setDebouncedRule] = useState<SmartRule | null>(rule);

    useEffect(() => {
        if (!rule) return;
        setError('');
        setConfirmDelete(false);
        setScopeDetailOpen(false);
        setCustomLimit(String(rule.limit || 30));
        const detected: SmartTemplateId = rule.templateId
            ?? (rule.conditions.length === 1 && rule.conditions[0].field === 'artist' ? 'artist' : 'custom');
        setTemplateId(isEditing ? (rule.templateId ?? 'custom') : detected);
        if (detected === 'artist' && rule.conditions[0]?.field === 'artist') {
            setArtistInput(String(rule.conditions[0].value ?? ''));
        } else {
            setArtistInput('');
        }
        setDebouncedRule(rule);
    }, [rule?.id]);

    useEffect(() => {
        if (!rule) {
            setDebouncedRule(null);
            return;
        }
        const timer = window.setTimeout(() => setDebouncedRule(rule), 150);
        return () => window.clearTimeout(timer);
    }, [rule]);

    const templateSupport = useMemo(() => ({
        most_played: isTemplateSupported('most_played', candidates, sessions),
        recent_liked: isTemplateSupported('recent_liked', candidates, sessions),
        artist: isTemplateSupported('artist', candidates, sessions),
        long_time_no_see: isTemplateSupported('long_time_no_see', candidates, sessions),
        lossless: isTemplateSupported('lossless', candidates, sessions),
        custom: { supported: true } as { supported: boolean; reason?: string },
    }), [candidates, sessions]);

    const matchedSongs = useMemo(
        () => (debouncedRule ? evaluateSmartPlaylist(candidates, sessions, debouncedRule) : []),
        [candidates, sessions, debouncedRule],
    );

    if (!rule) return null;

    const selectTemplate = (nextId: SmartTemplateId) => {
        if (!templateSupport[nextId].supported) return;
        setTemplateId(nextId);
        setError('');
        const rebuilt = buildRuleFromTemplate(nextId, {
            id: rule.id,
            artistName: artistInput,
            limit: rule.limit,
        });
        setCustomLimit(String(rebuilt.limit));
        onChange(rebuilt);
    };

    const addCustomCondition = () => {
        setError('');
        const raw = valueInput.trim();
        let parsed: string | number | boolean = raw;
        if (field === 'liked') {
            if (!['true', 'false'].includes(raw)) {
                setError('请选择收藏状态');
                return;
            }
            parsed = raw === 'true';
        } else if (NUMERIC_FIELDS.includes(field)) {
            if ((field === 'lastPlayed' || field === 'addedAt') && /^\d{1,4}$/.test(raw)) {
                const days = Number(raw);
                parsed = Date.now() - days * 86_400_000;
            } else if (field === 'lastPlayed' || field === 'addedAt') {
                parsed = parseDay(raw)?.getTime() ?? NaN;
            } else {
                parsed = Number(raw);
            }
            if (!raw || !Number.isFinite(parsed)) {
                setError('请输入有效的数字或日期');
                return;
            }
        }
        if (parsed === '' || rule.conditions.length >= 20) {
            setError('请输入筛选内容（最多 20 条条件）');
            return;
        }
        onChange({
            ...rule,
            templateId: 'custom',
            conditions: [...rule.conditions, { field, op: field === 'liked' || field === 'source' ? 'is' : op, value: parsed }],
        });
        setValueInput('');
    };

    const handleSave = () => {
        setError('');
        if (!rule.name.trim()) {
            setError('请输入歌单名称');
            return;
        }
        if (templateId === 'artist' && !artistInput.trim() && !rule.conditions.length) {
            setError('请输入歌手名称');
            return;
        }
        if (templateId === 'custom' && !rule.conditions.length) {
            setError('请至少添加一条筛选条件');
            return;
        }
        store.saveRule({ ...rule, templateId, updatedAt: Date.now() });
        onClose();
    };

    const allowedOps: SmartCondition['op'][] =
        field === 'liked' || field === 'source'
            ? ['is']
            : NUMERIC_FIELDS.includes(field)
                ? ['gte', 'lte', 'is']
                : ['contains', 'is'];

    const inputStyle: React.CSSProperties = {
        height: 44,
        borderRadius: 12,
        fontSize: 14,
        border: `1px solid ${tokens.border}`,
        background: tokens.cardBg,
        color: tokens.text,
        paddingLeft: 12,
        paddingRight: 12,
        width: '100%',
        outline: 'none',
    };

    const footer = (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, fontWeight: 500, color: tokens.text }}>
                    当前匹配 {matchedSongs.length} 首歌曲
                </span>
                <button
                    type="button"
                    disabled={!matchedSongs.length}
                    onClick={() => onPreview(rule)}
                    className="flex items-center gap-1.5 disabled:opacity-40"
                    style={{
                        minHeight: 40,
                        padding: '0 10px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: tokens.accent,
                    }}
                >
                    <Eye size={16} /> 预览匹配歌曲
                </button>
            </div>
            {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
            <button
                type="button"
                onClick={handleSave}
                className="w-full flex items-center justify-center"
                style={{
                    height: 48,
                    borderRadius: 14,
                    fontSize: 14,
                    fontWeight: 600,
                    background: tokens.primaryBtnBg,
                    color: tokens.primaryBtnText,
                }}
            >
                {isEditing ? '保存修改' : '创建智能歌单'}
            </button>
        </div>
    );

    return (
        <MobileSheet
            title={isEditing ? '编辑智能歌单' : '创建智能歌单'}
            subtitle="让听屿自动为你整理喜欢的音乐"
            footer={footer}
            onClose={onClose}
        >
            <div className="flex flex-col pb-4" style={{ gap: 16 }}>
                {/* 3. 六种模板选择卡片 */}
                {!isEditing && (
                    <div className="grid grid-cols-2" style={{ gap: 10 }}>
                        {SMART_TEMPLATES.map(tpl => {
                            const support = templateSupport[tpl.id];
                            const selected = templateId === tpl.id;
                            return (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    disabled={!support.supported}
                                    onClick={() => selectTemplate(tpl.id)}
                                    className="text-left flex flex-col justify-between transition-all"
                                    style={{
                                        minHeight: 88,
                                        padding: 12,
                                        borderRadius: 14,
                                        border: selected
                                            ? `1.5px solid ${tokens.accent}`
                                            : `1px solid ${tokens.border}`,
                                        background: selected ? tokens.accentSoft : tokens.cardBg,
                                        color: tokens.text,
                                        opacity: support.supported ? 1 : 0.48,
                                    }}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <TemplateIcon name={tpl.icon} color={selected ? tokens.accent : tokens.text} />
                                        {selected && <Check size={16} color={tokens.accent} />}
                                    </div>
                                    <div className="mt-2">
                                        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{tpl.title}</div>
                                        <div style={{ fontSize: 12, color: tokens.muted, marginTop: 2 }}>
                                            {support.supported ? tpl.description : (support.reason || tpl.description)}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* 4. 歌单名称 */}
                <div>
                    <label className="block mb-1.5" style={{ fontSize: 13, fontWeight: 500, color: tokens.muted }}>
                        歌单名称
                    </label>
                    <input
                        type="text"
                        value={rule.name}
                        maxLength={80}
                        placeholder="输入智能歌单名称"
                        onChange={e => onChange({ ...rule, name: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                {/* 专属歌手模板的歌手输入 */}
                {templateId === 'artist' && (
                    <div>
                        <label className="block mb-1.5" style={{ fontSize: 13, fontWeight: 500, color: tokens.muted }}>
                            歌手名称
                        </label>
                        <input
                            type="text"
                            value={artistInput}
                            placeholder="例如：林俊杰"
                            onChange={e => {
                                const nextArtist = e.target.value;
                                setArtistInput(nextArtist);
                                const trimmed = nextArtist.trim();
                                onChange({
                                    ...rule,
                                    templateId: 'artist',
                                    name: !rule.name || rule.name.endsWith(' 精选') || rule.name === '专属歌手'
                                        ? (trimmed ? `${trimmed} 精选` : '专属歌手')
                                        : rule.name,
                                    conditions: trimmed ? [{ field: 'artist', op: 'contains', value: trimmed }] : [],
                                });
                            }}
                            style={inputStyle}
                        />
                    </div>
                )}

                {/* 高级自定义规则 */}
                {templateId === 'custom' && (
                    <div className="flex flex-col gap-3 rounded-2xl p-3" style={{ background: tokens.cardBg, border: `1px solid ${tokens.border}` }}>
                        <div>
                            <label className="block mb-1.5" style={{ fontSize: 13, fontWeight: 500, color: tokens.muted }}>
                                条件组合方式
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { id: 'all', label: '满足全部条件' },
                                    { id: 'any', label: '满足任一条件' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => onChange({ ...rule, match: opt.id })}
                                        className="rounded-xl text-[13px] font-medium"
                                        style={{
                                            height: 40,
                                            border: rule.match === opt.id ? `1.5px solid ${tokens.accent}` : `1px solid ${tokens.border}`,
                                            background: rule.match === opt.id ? tokens.accentSoft : 'transparent',
                                            color: tokens.text,
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {rule.conditions.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                                <label className="block" style={{ fontSize: 13, fontWeight: 500, color: tokens.muted }}>
                                    已添加筛选条件
                                </label>
                                {rule.conditions.map((cond, idx) => (
                                    <div
                                        key={`${cond.field}-${idx}`}
                                        className="flex items-center justify-between rounded-xl px-3 py-2 text-[13px]"
                                        style={{ background: tokens.elevatedBg, color: tokens.text }}
                                    >
                                        <span className="truncate">{conditionSummary(cond)}</span>
                                        <button
                                            type="button"
                                            aria-label="移除条件"
                                            onClick={() => onChange({ ...rule, conditions: rule.conditions.filter((_, i) => i !== idx) })}
                                            className="ml-2 flex items-center justify-center"
                                            style={{ minWidth: 36, minHeight: 36, opacity: 0.75 }}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block mb-1" style={{ fontSize: 12, color: tokens.muted }}>筛选条件</label>
                                    <select
                                        value={field}
                                        onChange={e => {
                                            const nextField = e.target.value as SmartField;
                                            setField(nextField);
                                            setOp(nextField === 'liked' || nextField === 'source' ? 'is' : NUMERIC_FIELDS.includes(nextField) ? 'gte' : 'contains');
                                            setValueInput('');
                                        }}
                                        style={{ ...inputStyle, height: 40, fontSize: 13 }}
                                    >
                                        {EXPOSED_FIELDS.map(f => (
                                            <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block mb-1" style={{ fontSize: 12, color: tokens.muted }}>匹配方式</label>
                                    <select
                                        value={op}
                                        onChange={e => setOp(e.target.value as SmartCondition['op'])}
                                        style={{ ...inputStyle, height: 40, fontSize: 13 }}
                                    >
                                        {allowedOps.map(o => (
                                            <option key={o} value={o}>{OP_LABELS[o]}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {field === 'liked' || field === 'source' ? (
                                <div className="flex gap-2">
                                    <select
                                        value={valueInput}
                                        onChange={e => setValueInput(e.target.value)}
                                        style={{ ...inputStyle, height: 40, fontSize: 13, flex: 1 }}
                                    >
                                        <option value="">请选择…</option>
                                        {field === 'liked' ? (
                                            <>
                                                <option value="true">已收藏</option>
                                                <option value="false">未收藏</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="local">本地音乐</option>
                                                {omni.getProviderSummaries().map(p => (
                                                    <option key={p.providerId} value={p.providerId}>
                                                        {omni.getProviderLabel(p.providerId, false)}
                                                    </option>
                                                ))}
                                            </>
                                        )}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={addCustomCondition}
                                        className="flex items-center gap-1 rounded-xl px-3 text-[13px] font-medium shrink-0"
                                        style={{ height: 40, background: tokens.primaryBtnBg, color: tokens.primaryBtnText }}
                                    >
                                        <Plus size={14} /> 添加
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={valueInput}
                                        placeholder={valueHintFor(field)}
                                        onChange={e => setValueInput(e.target.value)}
                                        style={{ ...inputStyle, height: 40, fontSize: 13, flex: 1 }}
                                    />
                                    <button
                                        type="button"
                                        onClick={addCustomCondition}
                                        className="flex items-center gap-1 rounded-xl px-3 text-[13px] font-medium shrink-0"
                                        style={{ height: 40, background: tokens.primaryBtnBg, color: tokens.primaryBtnText }}
                                    >
                                        <Plus size={14} /> 添加
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 5. 排序方式（独占一行） */}
                <div>
                    <label className="block mb-1.5" style={{ fontSize: 13, fontWeight: 500, color: tokens.muted }}>
                        排序方式
                    </label>
                    <select
                        value={rule.sort}
                        onChange={e => onChange({ ...rule, sort: e.target.value as SmartRule['sort'] })}
                        style={inputStyle}
                    >
                        {SORT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                {/* 6. 歌曲数量上限（四列等宽快捷选项 + 独立自定义输入框） */}
                <div>
                    <label className="block mb-1.5" style={{ fontSize: 13, fontWeight: 500, color: tokens.muted }}>
                        歌曲数量上限
                    </label>
                    <div className="grid grid-cols-4" style={{ gap: 8 }}>
                        {LIMIT_PRESETS.map(preset => {
                            const selected = rule.limit === preset;
                            return (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => { setCustomLimit(String(preset)); onChange({ ...rule, limit: preset }); }}
                                    className="flex items-center justify-center"
                                    style={{ minHeight: 48 }}
                                >
                                    <span
                                        className="w-full flex items-center justify-center whitespace-nowrap"
                                        style={{
                                            height: 36,
                                            borderRadius: 10,
                                            fontSize: 13,
                                            fontWeight: selected ? 600 : 500,
                                            padding: '0 8px',
                                            border: selected ? `1.5px solid ${tokens.accent}` : `1px solid ${tokens.border}`,
                                            background: selected ? tokens.accentSoft : tokens.cardBg,
                                            color: selected ? tokens.accent : tokens.text,
                                        }}
                                    >
                                        {preset} 首
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <span style={{ fontSize: 12, color: tokens.muted, whiteSpace: 'nowrap' }}>自定义数量</span>
                        <input
                            type="number"
                            min={1}
                            max={1000}
                            value={customLimit}
                            placeholder="1-1000"
                            onChange={e => {
                                setCustomLimit(e.target.value);
                                const num = Number(e.target.value);
                                if (Number.isInteger(num) && num >= 1 && num <= 1000) {
                                    onChange({ ...rule, limit: num });
                                }
                            }}
                            style={{ ...inputStyle, flex: 1 }}
                        />
                    </div>
                </div>

                {/* 7. 筛选范围说明 */}
                <div>
                    <div className="flex items-center justify-between gap-2">
                        <span style={{ fontSize: 12, color: tokens.muted }}>从已收藏、本地音乐及已记录的歌曲中筛选</span>
                        <button
                            type="button"
                            onClick={() => setScopeDetailOpen(v => !v)}
                            className="flex items-center gap-1 shrink-0"
                            style={{ fontSize: 12, color: tokens.accent, minHeight: 32 }}
                        >
                            <Info size={14} /> 说明
                        </button>
                    </div>
                    {scopeDetailOpen && (
                        <p className="mt-1.5 rounded-xl p-2.5 m-0" style={{ fontSize: 12, lineHeight: 1.5, background: tokens.elevatedBg, color: tokens.muted }}>
                            当前筛选范围为本机已同步的收藏歌曲、已索引歌单曲目、听屿记录到的真实有效收听历史以及本地音乐曲库（不会直接全网检索平台全部在线曲库，也不会改动平台原始歌单）。
                        </p>
                    )}
                </div>

                {isEditing && !confirmDelete && (
                    <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="w-full rounded-xl py-2.5 text-[13px] text-red-500 border border-red-500/30"
                    >
                        删除此智能歌单（仅删除歌单，不删歌曲或原始收藏）
                    </button>
                )}

                {confirmDelete && (
                    <div className="flex items-center justify-between rounded-xl p-3 border border-red-500/40">
                        <span className="text-[12px] text-red-500">确认删除该智能歌单？</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-1 text-[12px] rounded-lg border border-current/15">取消</button>
                            <button type="button" onClick={() => { store.removeRule(rule.id); setConfirmDelete(false); onClose(); }} className="px-3 py-1 text-[12px] rounded-lg bg-red-500 text-white">确认删除</button>
                        </div>
                    </div>
                )}
            </div>
        </MobileSheet>
    );
}

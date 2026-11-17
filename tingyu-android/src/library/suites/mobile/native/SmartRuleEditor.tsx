import React, { useEffect, useMemo, useState } from 'react';
import { Flame, Heart, Mic, Clock, Sparkles, SlidersHorizontal, Plus, Trash2, Eye, Check } from 'lucide-react';
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
    const isEditing = Boolean(rule && store.rules.some(item => item.id === rule.id));
    const [templateId, setTemplateId] = useState<SmartTemplateId>('most_played');
    const [artistInput, setArtistInput] = useState('');
    const [field, setField] = useState<SmartField>('artist');
    const [op, setOp] = useState<SmartCondition['op']>('contains');
    const [valueInput, setValueInput] = useState('');
    const [customLimit, setCustomLimit] = useState('30');
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [debouncedRule, setDebouncedRule] = useState<SmartRule | null>(rule);

    useEffect(() => {
        if (!rule) return;
        setError('');
        setConfirmDelete(false);
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

    const templateSupport = useMemo(() => {
        const map: Record<SmartTemplateId, { supported: boolean; reason?: string }> = {
            most_played: isTemplateSupported('most_played', candidates, sessions),
            recent_liked: isTemplateSupported('recent_liked', candidates, sessions),
            artist: isTemplateSupported('artist', candidates, sessions),
            long_time_no_see: isTemplateSupported('long_time_no_see', candidates, sessions),
            lossless: isTemplateSupported('lossless', candidates, sessions),
            custom: { supported: true },
        };
        return map;
    }, [candidates, sessions]);

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

    return (
        <MobileSheet title={isEditing ? '编辑智能歌单' : '创建智能歌单'} onClose={onClose}>
            <div className="flex flex-col gap-4 pb-6" style={{ paddingLeft: 4, paddingRight: 4 }}>
                <p className="text-[12px] opacity-75 m-0">让听屿自动为你整理喜欢的音乐</p>

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
                                            ? '1.5px solid var(--tingyu-accent, #527E9F)'
                                            : '1px solid var(--tingyu-border, rgba(120,140,160,0.22))',
                                        background: selected
                                            ? 'var(--tingyu-accent-soft, rgba(113,150,181,0.16))'
                                            : 'var(--tingyu-surface-card, rgba(255,255,255,0.06))',
                                        opacity: support.supported ? 1 : 0.48,
                                    }}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <TemplateIcon
                                            name={tpl.icon}
                                            color={selected ? 'var(--tingyu-accent, #527E9F)' : 'currentColor'}
                                        />
                                        {selected && <Check size={16} color="var(--tingyu-accent, #527E9F)" />}
                                    </div>
                                    <div className="mt-2">
                                        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{tpl.title}</div>
                                        <div style={{ fontSize: 12, opacity: 0.72, marginTop: 2 }}>
                                            {support.supported ? tpl.description : (support.reason || tpl.description)}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex flex-col gap-3 rounded-2xl p-3" style={{ background: 'var(--tingyu-surface-card, rgba(255,255,255,0.05))' }}>
                    <div>
                        <label className="block text-[12px] opacity-75 mb-1">歌单名称</label>
                        <input
                            type="text"
                            value={rule.name}
                            maxLength={80}
                            placeholder="输入智能歌单名称"
                            onChange={e => onChange({ ...rule, name: e.target.value })}
                            className="w-full rounded-xl px-3 py-2 text-[14px] bg-transparent border border-current/15 outline-none"
                        />
                    </div>

                    {templateId === 'artist' && (
                        <div>
                            <label className="block text-[12px] opacity-75 mb-1">歌手名称</label>
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
                                className="w-full rounded-xl px-3 py-2 text-[14px] bg-transparent border border-current/15 outline-none"
                            />
                        </div>
                    )}

                    {templateId === 'custom' && (
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="block text-[12px] opacity-75 mb-1.5">条件组合方式</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { id: 'all', label: '满足全部条件' },
                                        { id: 'any', label: '满足任一条件' },
                                    ] as const).map(opt => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => onChange({ ...rule, match: opt.id })}
                                            className="rounded-xl py-2 px-3 text-[13px] font-medium"
                                            style={{
                                                border: rule.match === opt.id
                                                    ? '1.5px solid var(--tingyu-accent, #527E9F)'
                                                    : '1px solid var(--tingyu-border, rgba(120,140,160,0.22))',
                                                background: rule.match === opt.id ? 'var(--tingyu-accent-soft, rgba(113,150,181,0.16))' : 'transparent',
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {rule.conditions.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="block text-[12px] opacity-75">已添加筛选条件</label>
                                    {rule.conditions.map((cond, idx) => (
                                        <div
                                            key={`${cond.field}-${idx}`}
                                            className="flex items-center justify-between rounded-xl px-3 py-2 text-[13px]"
                                            style={{ background: 'var(--tingyu-surface-elevated, rgba(120,140,160,0.1))' }}
                                        >
                                            <span className="truncate">{conditionSummary(cond)}</span>
                                            <button
                                                type="button"
                                                aria-label="移除条件"
                                                onClick={() => onChange({ ...rule, conditions: rule.conditions.filter((_, i) => i !== idx) })}
                                                className="ml-2 p-1 opacity-75 hover:opacity-100"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-col gap-2 rounded-xl p-2.5 border border-current/10">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[11px] opacity-70 mb-1">筛选条件</label>
                                        <select
                                            value={field}
                                            onChange={e => {
                                                const nextField = e.target.value as SmartField;
                                                setField(nextField);
                                                setOp(nextField === 'liked' || nextField === 'source' ? 'is' : NUMERIC_FIELDS.includes(nextField) ? 'gte' : 'contains');
                                                setValueInput('');
                                            }}
                                            className="w-full rounded-lg px-2 py-1.5 text-[13px] bg-transparent border border-current/15"
                                        >
                                            {EXPOSED_FIELDS.map(f => (
                                                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] opacity-70 mb-1">匹配方式</label>
                                        <select
                                            value={op}
                                            onChange={e => setOp(e.target.value as SmartCondition['op'])}
                                            className="w-full rounded-lg px-2 py-1.5 text-[13px] bg-transparent border border-current/15"
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
                                            className="flex-1 rounded-lg px-2 py-1.5 text-[13px] bg-transparent border border-current/15"
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
                                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-medium"
                                            style={{ background: 'var(--tingyu-accent, #527E9F)', color: '#fff' }}
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
                                            className="flex-1 rounded-lg px-2.5 py-1.5 text-[13px] bg-transparent border border-current/15 outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={addCustomCondition}
                                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-medium"
                                            style={{ background: 'var(--tingyu-accent, #527E9F)', color: '#fff' }}
                                        >
                                            <Plus size={14} /> 添加
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-[12px] opacity-75 mb-1">排序方式</label>
                            <select
                                value={rule.sort}
                                onChange={e => onChange({ ...rule, sort: e.target.value as SmartRule['sort'] })}
                                className="w-full rounded-xl px-2.5 py-2 text-[13px] bg-transparent border border-current/15"
                            >
                                {SORT_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[12px] opacity-75 mb-1">歌曲数量上限</label>
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                value={customLimit}
                                onChange={e => {
                                    setCustomLimit(e.target.value);
                                    const num = Number(e.target.value);
                                    if (Number.isInteger(num) && num >= 1 && num <= 1000) {
                                        onChange({ ...rule, limit: num });
                                    }
                                }}
                                className="w-full rounded-xl px-2.5 py-2 text-[13px] bg-transparent border border-current/15 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {LIMIT_PRESETS.map(preset => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => { setCustomLimit(String(preset)); onChange({ ...rule, limit: preset }); }}
                                className="rounded-full px-3 py-1 text-[12px]"
                                style={{
                                    border: rule.limit === preset
                                        ? '1.5px solid var(--tingyu-accent, #527E9F)'
                                        : '1px solid var(--tingyu-border, rgba(120,140,160,0.22))',
                                    background: rule.limit === preset ? 'var(--tingyu-accent-soft, rgba(113,150,181,0.16))' : 'transparent',
                                }}
                            >
                                {preset} 首
                            </button>
                        ))}
                    </div>
                </div>

                <div className="text-[12px] opacity-70 leading-relaxed">
                    筛选范围：当前已同步收藏、已索引歌单歌曲、听屿真实收听记录及本地音乐（不直接筛选平台全部在线曲库）。
                </div>

                <div className="flex items-center justify-between rounded-2xl px-3.5 py-2.5" style={{ background: 'var(--tingyu-surface-card, rgba(255,255,255,0.05))' }}>
                    <span className="text-[13px] font-medium">当前匹配 {matchedSongs.length} 首歌曲</span>
                    <button
                        type="button"
                        disabled={!matchedSongs.length}
                        onClick={() => onPreview(rule)}
                        className="flex items-center gap-1.5 text-[13px] font-medium disabled:opacity-40"
                        style={{ color: 'var(--tingyu-accent, #527E9F)' }}
                    >
                        <Eye size={15} /> 预览匹配歌曲
                    </button>
                </div>

                {error && <div className="text-[12px] text-red-500">{error}</div>}

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

                <button
                    type="button"
                    onClick={handleSave}
                    className="w-full rounded-2xl py-3.5 text-[15px] font-semibold text-white"
                    style={{ background: 'var(--tingyu-accent, #527E9F)' }}
                >
                    {isEditing ? '保存修改' : '创建智能歌单'}
                </button>
            </div>
        </MobileSheet>
    );
}

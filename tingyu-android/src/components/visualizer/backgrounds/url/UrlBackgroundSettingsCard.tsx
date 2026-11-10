import React, { useCallback, useState } from 'react';
import { Globe, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { Theme, UrlBackgroundItem } from '../../../../types';
import { colorWithAlpha } from '../../colorMix';
import { normalizeUrlBackgroundUrl } from '../../../../utils/urlBackground';

// src/components/visualizer/backgrounds/url/UrlBackgroundSettingsCard.tsx
// Settings card for managing URL background list (add/edit/delete/select).

interface UrlBackgroundSettingsCardProps {
    t: (key: string) => string;
    isDaylight: boolean;
    theme: Theme;
    controlCardBg: string;
    urlBackgroundList?: UrlBackgroundItem[];
    urlBackgroundSelectedId?: string | null;
    onAddUrlBackgroundItem?: (item: UrlBackgroundItem) => void;
    onUpdateUrlBackgroundItem?: (id: string, patch: Partial<Omit<UrlBackgroundItem, 'id'>>) => void;
    onDeleteUrlBackgroundItem?: (id: string) => void;
    onSetUrlBackgroundSelectedId?: (id: string | null) => void;
}

const generateId = () => `url-bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const UrlBackgroundSettingsCard: React.FC<UrlBackgroundSettingsCardProps> = ({
    t,
    isDaylight,
    theme,
    controlCardBg,
    urlBackgroundList = [],
    urlBackgroundSelectedId = null,
    onAddUrlBackgroundItem,
    onUpdateUrlBackgroundItem,
    onDeleteUrlBackgroundItem,
    onSetUrlBackgroundSelectedId,
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftUrl, setDraftUrl] = useState('');
    const [draftNote, setDraftNote] = useState('');

    const resetDraft = useCallback(() => {
        setDraftUrl('');
        setDraftNote('');
        setIsAdding(false);
        setEditingId(null);
    }, []);

    const handleAdd = useCallback(() => {
        const trimmedUrl = normalizeUrlBackgroundUrl(draftUrl);
        if (!trimmedUrl) return;
        const item: UrlBackgroundItem = {
            id: generateId(),
            url: trimmedUrl,
            note: draftNote.trim() || trimmedUrl,
        };
        onAddUrlBackgroundItem?.(item);
        onSetUrlBackgroundSelectedId?.(item.id);
        resetDraft();
    }, [draftUrl, draftNote, onAddUrlBackgroundItem, onSetUrlBackgroundSelectedId, resetDraft]);

    const handleStartEdit = useCallback((item: UrlBackgroundItem) => {
        setEditingId(item.id);
        setDraftUrl(item.url);
        setDraftNote(item.note);
    }, []);

    const handleSaveEdit = useCallback(() => {
        if (!editingId) return;
        const trimmedUrl = normalizeUrlBackgroundUrl(draftUrl);
        if (!trimmedUrl) return;
        onUpdateUrlBackgroundItem?.(editingId, {
            url: trimmedUrl,
            note: draftNote.trim() || trimmedUrl,
        });
        resetDraft();
    }, [editingId, draftUrl, draftNote, onUpdateUrlBackgroundItem, resetDraft]);

    const handleDelete = useCallback((id: string) => {
        onDeleteUrlBackgroundItem?.(id);
    }, [onDeleteUrlBackgroundItem]);

    const handleSelect = useCallback((id: string) => {
        onSetUrlBackgroundSelectedId?.(id);
    }, [onSetUrlBackgroundSelectedId]);

    const isEditingOrAdding = isAdding || editingId !== null;
    const borderColor = colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.16);
    const itemBg = colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34);
    const inputBg = colorWithAlpha(theme.backgroundColor, isDaylight ? 0.42 : 0.52);

    return (
        <div className="rounded-[24px] border p-4 space-y-4" style={{ backgroundColor: controlCardBg, borderColor }} data-settings-style='{"radius":24,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
            <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                <div className="text-sm font-medium" style={{ color: theme.primaryColor }} data-settings-style='{"font":14,"weight":500}' data-settings-layout="column">
                    {t('options.urlBackgroundSettings')}
                </div>
                <div className="text-xs opacity-70" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12}' data-settings-layout="column">
                    {t('options.urlBackgroundSettingsDesc')}
                </div>
            </div>

            {/* URL list */}
            {urlBackgroundList.length > 0 && (
                <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                    {urlBackgroundList.map(item => (
                        <div
                            key={item.id}
                            className="rounded-2xl border p-3 transition-all"
                            style={{
                                borderColor: item.id === urlBackgroundSelectedId ? theme.accentColor : borderColor,
                                backgroundColor: item.id === urlBackgroundSelectedId
                                    ? colorWithAlpha(theme.accentColor, isDaylight ? 0.1 : 0.16)
                                    : itemBg,
                            }}
                         data-settings-style='{"radius":16,"border":true,"padding":[12,12,12,12]}' data-settings-layout="card">
                            {editingId === item.id ? (
                                <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                                    <input
                                        type="url"
                                        value={draftUrl}
                                        onChange={e => setDraftUrl(e.target.value)}
                                        placeholder="https://example.com"
                                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                                        style={{
                                            backgroundColor: inputBg,
                                            borderColor,
                                            color: theme.primaryColor,
                                        }}
                                     data-settings-style='{"radius":12,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="column"/>
                                    <input
                                        type="text"
                                        value={draftNote}
                                        onChange={e => setDraftNote(e.target.value)}
                                        placeholder={t('options.urlBackgroundNotePlaceholder')}
                                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                                        style={{
                                            backgroundColor: inputBg,
                                            borderColor,
                                            color: theme.primaryColor,
                                        }}
                                     data-settings-style='{"radius":12,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="column"/>
                                    <div className="flex gap-2 justify-end" data-settings-style='{"align":"end","gap":8}' data-settings-layout="row">
                                        <button
                                            type="button"
                                            onClick={resetDraft}
                                            className="h-8 w-8 rounded-full border flex items-center justify-center transition-colors hover:bg-white/10"
                                            style={{ borderColor, color: theme.secondaryColor }}
                                         data-settings-style='{"align":"center","center":true,"height":32,"width":32,"radius":64,"border":true}' data-settings-layout="row">
                                            <X size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSaveEdit}
                                            disabled={!draftUrl.trim()}
                                            className="h-8 w-8 rounded-full border flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40"
                                            style={{ borderColor: theme.accentColor, color: theme.accentColor }}
                                         data-settings-style='{"align":"center","center":true,"height":32,"width":32,"radius":64,"border":true}' data-settings-layout="row">
                                            <Check size={14} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3" data-settings-style='{"align":"center","gap":12}' data-settings-layout="row">
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(item.id)}
                                        className="flex-1 text-left min-w-0"
                                     data-settings-style='{"grow":true}' data-settings-layout="column">
                                        <div className="text-sm font-medium truncate" style={{ color: theme.primaryColor }} data-settings-style='{"font":14,"weight":500}' data-settings-layout="column">
                                            {item.note}
                                        </div>
                                        <div className="text-xs opacity-60 truncate mt-0.5" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12,"tone":"muted","margin":[0,2,0,0]}' data-settings-layout="column">
                                            {item.url}
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0" data-settings-style='{"align":"center","gap":4}' data-settings-layout="row">
                                        <button
                                            type="button"
                                            onClick={() => handleStartEdit(item)}
                                            className="h-7 w-7 rounded-full border flex items-center justify-center transition-colors hover:bg-white/10"
                                            style={{ borderColor, color: theme.secondaryColor }}
                                         data-settings-style='{"align":"center","center":true,"height":28,"width":28,"radius":64,"border":true}' data-settings-layout="row">
                                            <Pencil size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(item.id)}
                                            className="h-7 w-7 rounded-full border flex items-center justify-center transition-colors hover:bg-red-500/10"
                                            style={{ borderColor, color: theme.secondaryColor }}
                                         data-settings-style='{"align":"center","center":true,"height":28,"width":28,"radius":64,"border":true}' data-settings-layout="row">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add new URL form */}
            {isAdding ? (
                <div className="space-y-2 rounded-2xl border p-3" style={{ borderColor, backgroundColor: itemBg }} data-settings-style='{"gap":8,"radius":16,"border":true,"padding":[12,12,12,12]}' data-settings-layout="card">
                    <input
                        type="url"
                        value={draftUrl}
                        onChange={e => setDraftUrl(e.target.value)}
                        placeholder="https://example.com"
                        autoFocus
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{
                            backgroundColor: inputBg,
                            borderColor,
                            color: theme.primaryColor,
                        }}
                     data-settings-style='{"radius":12,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="column"/>
                    <input
                        type="text"
                        value={draftNote}
                        onChange={e => setDraftNote(e.target.value)}
                        placeholder={t('options.urlBackgroundNotePlaceholder')}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{
                            backgroundColor: inputBg,
                            borderColor,
                            color: theme.primaryColor,
                        }}
                     data-settings-style='{"radius":12,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="column"/>
                    <div className="flex gap-2 justify-end" data-settings-style='{"align":"end","gap":8}' data-settings-layout="row">
                        <button
                            type="button"
                            onClick={resetDraft}
                            className="h-8 w-8 rounded-full border flex items-center justify-center transition-colors hover:bg-white/10"
                            style={{ borderColor, color: theme.secondaryColor }}
                         data-settings-style='{"align":"center","center":true,"height":32,"width":32,"radius":64,"border":true}' data-settings-layout="row">
                            <X size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={!draftUrl.trim()}
                            className="h-8 w-8 rounded-full border flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40"
                            style={{ borderColor: theme.accentColor, color: theme.accentColor }}
                         data-settings-style='{"align":"center","center":true,"height":32,"width":32,"radius":64,"border":true}' data-settings-layout="row">
                            <Check size={14} />
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => {
                        setDraftUrl('');
                        setDraftNote('');
                        setIsAdding(true);
                    }}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-colors hover:bg-white/5"
                    style={{ borderColor, color: theme.primaryColor }}
                 data-settings-style='{"align":"center","center":true,"height":40,"gap":8,"radius":16,"border":true,"font":14,"weight":500,"padding":[16,0,16,0]}' data-settings-layout="row">
                    <Plus size={16} />
                    {t('options.urlBackgroundAdd')}
                </button>
            )}

            {urlBackgroundList.length === 0 && !isAdding && (
                <div className="flex flex-col items-center gap-2 py-3 opacity-50" data-settings-style='{"align":"center","gap":8,"tone":"muted","padding":[0,12,0,12]}' data-settings-layout="column">
                    <Globe size={24} style={{ color: theme.secondaryColor }} />
                    <div className="text-xs" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12}' data-settings-layout="column">
                        {t('options.urlBackgroundEmpty')}
                    </div>
                </div>
            )}
        </div>
    );
};

export { UrlBackgroundSettingsCard };

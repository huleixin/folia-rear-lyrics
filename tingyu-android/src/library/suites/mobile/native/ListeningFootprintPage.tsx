import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, MoreHorizontal, Disc3, Headphones, Compass } from 'lucide-react';
import { omni } from '../../../../services/onlineMusic/omni';
import { getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { absolutePageImage } from '../../../../services/nativePages';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { calendarDaysInRange, type ListeningRange } from '../../../core/model/listeningRange';
import { LISTENING_STATISTICS_SYNC, type ListeningEntitySummary, type ListeningSummary } from '../../../../services/listeningStatistics';
import type { SongResult } from '../../../../types';
import MobileSheet from '../../../../components/shared/MobileSheet';
import { useSheetThemeTokens } from './sheetThemeTokens';

// src/library/suites/mobile/native/ListeningFootprintPage.tsx
const RANGES: Array<{ id: ListeningRange; label: string }> = [
    { id: 'week', label: '最近7天' },
    { id: 'month', label: '最近30天' },
    { id: 'year', label: '今年' },
    { id: 'all', label: '全部' },
];

const RING_COLORS = ['#7196B5', '#527E9F', '#AAC8DF', '#B9BCD9', '#8EAEC8'];

function formatDurationMinutes(seconds: number): { value: string; unit: string } {
    const mins = Math.floor(seconds / 60);
    if (mins >= 60) {
        const hrs = (mins / 60).toFixed(1).replace(/\.0$/, '');
        return { value: hrs, unit: '小时' };
    }
    return { value: String(mins), unit: '分钟' };
}

export default function ListeningFootprintPage({
    open,
    onClose,
    range,
    onRangeChange,
    summary,
    loading,
    error,
    truncated,
    onRetry,
    onPlaySong,
    onOpenEntity,
    onClearStats,
    onGoDiscover,
}: {
    open: boolean;
    onClose: () => void;
    range: ListeningRange;
    onRangeChange: (next: ListeningRange) => void;
    summary: ListeningSummary;
    loading: boolean;
    error: boolean;
    truncated: boolean;
    onRetry: () => void;
    onPlaySong: (song: SongResult, queue?: SongResult[]) => void;
    onOpenEntity: (entry: ListeningEntitySummary, kind: 'artist' | 'album') => void;
    onClearStats: () => void;
    onGoDiscover: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const tokens = useSheetThemeTokens();

    useEffect(() => {
        if (!open) return;
        window.dispatchEvent(new Event(LISTENING_STATISTICS_SYNC));
    }, [open]);

    if (!open) return null;

    const totalStat = formatDurationMinutes(summary.seconds);
    const days = calendarDaysInRange(range, Date.now(), summary.firstRecordedAt);
    const dailyMap = new Map(summary.daily.map(d => [d.day, d]));
    const dailySeries = days.map(day => ({
        day,
        seconds: dailyMap.get(day)?.seconds ?? 0,
        plays: dailyMap.get(day)?.plays ?? 0,
    }));
    const dailyMax = Math.max(1, ...dailySeries.map(d => d.seconds));
    const hourlyMax = Math.max(1, ...summary.hourly);
    const topSongs = summary.topSongs.slice(0, 10);
    const topArtists = summary.topArtists.slice(0, 8);
    const topAlbums = summary.topAlbums.slice(0, 6);

    const providerTotal = Math.max(1, summary.providers.reduce((acc, p) => acc + p.seconds, 0));
    let ringOffset = 0;
    const radius = 38;
    const circumference = 2 * Math.PI * radius;

    return createPortal(
        <div
            className="fixed inset-0 overflow-y-auto"
            style={{
                zIndex: 132,
                background: tokens.pageBg,
                color: tokens.text,
                paddingTop: 'env(safe-area-inset-top, 16px)',
                paddingBottom: 152,
            }}
        >
            <div style={{ paddingLeft: 20, paddingRight: 20 }}>
                {/* 1. Header */}
                <div className="flex items-center justify-between" style={{ minHeight: 52 }}>
                    <button
                        type="button"
                        aria-label="返回"
                        onClick={onClose}
                        className="flex items-center justify-center rounded-full"
                        style={{ width: 40, height: 40, marginLeft: -8 }}
                    >
                        <ArrowLeft size={22} />
                    </button>
                    <h1 style={{ fontSize: 22, fontWeight: 650, margin: 0, flex: 1, marginLeft: 4 }}>音乐足迹</h1>
                    <button
                        type="button"
                        aria-label="更多操作"
                        onClick={() => setMenuOpen(true)}
                        className="flex items-center justify-center rounded-full"
                        style={{ width: 40, height: 40, marginRight: -8 }}
                    >
                        <MoreHorizontal size={22} />
                    </button>
                </div>

                {/* 2. Subtitle */}
                <p style={{ fontSize: 14, opacity: 0.72, margin: '2px 0 16px' }}>每一首歌，都是时间留下的痕迹</p>

                {/* 3. Time Range Selector */}
                <div className="flex flex-wrap gap-2" style={{ marginBottom: 24 }}>
                    {RANGES.map(item => {
                        const selected = range === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onRangeChange(item.id)}
                                className="rounded-full px-3.5 py-1.5 transition-colors"
                                style={{
                                    fontSize: 13,
                                    fontWeight: selected ? 600 : 500,
                                    background: selected ? '#527E9F' : 'var(--tingyu-surface-card, rgba(113,150,181,0.12))',
                                    color: selected ? '#FFFFFF' : 'inherit',
                                }}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>

                {loading && (
                    <div className="rounded-2xl p-4 text-[14px] opacity-75" style={{ background: 'var(--tingyu-surface-card, rgba(255,255,255,0.65))' }}>
                        正在整理真实收听记录…
                    </div>
                )}

                {!loading && error && (
                    <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'var(--tingyu-surface-card, rgba(255,255,255,0.65))' }}>
                        <span className="text-[14px]">读取收听统计失败</span>
                        <button type="button" onClick={onRetry} className="text-[13px] font-semibold" style={{ color: '#527E9F' }}>重试</button>
                    </div>
                )}

                {!loading && !error && summary.plays === 0 && (
                    <div
                        className="flex flex-col items-center text-center"
                        style={{
                            borderRadius: 20,
                            padding: '36px 20px',
                            background: 'var(--tingyu-surface-card, rgba(255,255,255,0.68))',
                        }}
                    >
                        <div
                            className="flex items-center justify-center rounded-full mb-4"
                            style={{ width: 64, height: 64, background: 'rgba(113,150,181,0.16)', color: '#527E9F' }}
                        >
                            <Headphones size={28} />
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 650 }}>你的音乐故事刚刚开始</div>
                        <p style={{ fontSize: 14, opacity: 0.72, margin: '8px 0 20px', maxWidth: 260, lineHeight: 1.5 }}>
                            听屿将记录你的真实收听，慢慢为你整理专属音乐足迹。
                        </p>
                        <button
                            type="button"
                            onClick={onGoDiscover}
                            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white"
                            style={{ background: '#527E9F' }}
                        >
                            <Compass size={16} /> 去发现音乐
                        </button>
                    </div>
                )}

                {!loading && !error && summary.plays > 0 && (
                    <div className="flex flex-col" style={{ gap: 24 }}>
                        {/* 4. Overview Card */}
                        <div
                            style={{
                                borderRadius: 20,
                                padding: 16,
                                background: 'var(--tingyu-surface-card, rgba(255,255,255,0.72))',
                            }}
                        >
                            <div style={{ fontSize: 12, opacity: 0.7 }}>累计有效收听时长</div>
                            <div className="flex items-baseline gap-1.5 mt-1">
                                <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.15 }}>{totalStat.value}</span>
                                <span style={{ fontSize: 14, opacity: 0.75 }}>{totalStat.unit}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-current/10">
                                {[
                                    { label: '收听次数', val: summary.plays },
                                    { label: '听过歌曲', val: summary.songs },
                                    { label: '听过歌手', val: summary.artists },
                                    { label: '听过专辑', val: summary.albums },
                                ].map(stat => (
                                    <div key={stat.label}>
                                        <div style={{ fontSize: 22, fontWeight: 650 }}>{stat.val}</div>
                                        <div style={{ fontSize: 12, opacity: 0.68 }}>{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 5. Daily Listening Trend */}
                        <section>
                            <h2 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 12px' }}>每日收听趋势</h2>
                            <div style={{ borderRadius: 16, padding: 16, background: 'var(--tingyu-surface-card, rgba(255,255,255,0.72))' }}>
                                <div className="flex items-end gap-1" style={{ height: 96 }}>
                                    {dailySeries.slice(-30).map(item => {
                                        const pct = item.seconds > 0 ? Math.max(8, Math.round((item.seconds / dailyMax) * 100)) : 3;
                                        return (
                                            <div key={item.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${item.day}: ${Math.floor(item.seconds / 60)}分钟`}>
                                                <div
                                                    className="w-full rounded-t"
                                                    style={{
                                                        height: `${pct}%`,
                                                        background: item.seconds > 0 ? '#7196B5' : 'rgba(113,150,181,0.16)',
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-between mt-2" style={{ fontSize: 12, opacity: 0.68 }}>
                                    <span>{dailySeries[Math.max(0, dailySeries.length - 30)]?.day.slice(5) ?? ''}</span>
                                    <span>真实日历日期（无记录记为 0）</span>
                                    <span>{dailySeries[dailySeries.length - 1]?.day.slice(5) ?? ''}</span>
                                </div>
                            </div>
                        </section>

                        {/* 6. Music Source Breakdown */}
                        {summary.providers.length > 0 && (
                            <section>
                                <h2 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 12px' }}>音乐来源占比</h2>
                                <div className="flex items-center gap-4" style={{ borderRadius: 16, padding: 16, background: 'var(--tingyu-surface-card, rgba(255,255,255,0.72))' }}>
                                    <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
                                        {summary.providers.map((prov, idx) => {
                                            const frac = prov.seconds / providerTotal;
                                            const dash = frac * circumference;
                                            const offset = -ringOffset;
                                            ringOffset += dash;
                                            return (
                                                <circle
                                                    key={prov.id}
                                                    cx="48"
                                                    cy="48"
                                                    r={radius}
                                                    fill="none"
                                                    stroke={RING_COLORS[idx % RING_COLORS.length]}
                                                    strokeWidth="12"
                                                    strokeDasharray={`${dash} ${circumference}`}
                                                    strokeDashoffset={offset}
                                                    transform="rotate(-90 48 48)"
                                                />
                                            );
                                        })}
                                    </svg>
                                    <div className="flex-1 flex flex-col gap-2">
                                        {summary.providers.map((prov, idx) => {
                                            const pct = Math.round((prov.seconds / providerTotal) * 100);
                                            return (
                                                <div key={prov.id} className="flex items-center justify-between text-[13px]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: RING_COLORS[idx % RING_COLORS.length] }} />
                                                        <span>{omni.getProviderLabel(prov.id)}</span>
                                                    </div>
                                                    <span style={{ fontSize: 12, opacity: 0.72 }}>{pct}% · {Math.floor(prov.seconds / 60)}分钟</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* 7. Most Played Songs */}
                        {topSongs.length > 0 && (
                            <section>
                                <h2 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 12px' }}>最常听歌曲</h2>
                                <div className="flex flex-col gap-2" style={{ borderRadius: 16, padding: 16, background: 'var(--tingyu-surface-card, rgba(255,255,255,0.72))' }}>
                                    {topSongs.map((item, index) => {
                                        const cover = absolutePageImage(getSongCoverUrl(item.song));
                                        return (
                                            <button
                                                key={getPlaybackSongKey(item.song)}
                                                type="button"
                                                onClick={() => onPlaySong(item.song, topSongs.map(s => s.song))}
                                                className="flex items-center gap-3 text-left py-1.5"
                                            >
                                                <span className="w-5 text-center font-semibold" style={{ fontSize: 14, color: index < 3 ? '#527E9F' : 'inherit', opacity: index < 3 ? 1 : 0.6 }}>{index + 1}</span>
                                                {cover ? (
                                                    <img src={cover} alt="" className="rounded-lg object-cover shrink-0" style={{ width: 42, height: 42 }} />
                                                ) : (
                                                    <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 42, height: 42, background: 'rgba(113,150,181,0.16)' }}>
                                                        <Disc3 size={18} color="#527E9F" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="truncate font-medium" style={{ fontSize: 14 }}>{item.song.name}</div>
                                                    <div className="truncate" style={{ fontSize: 12, opacity: 0.68 }}>{item.song.artists.map(a => a.name).join(' / ')}</div>
                                                </div>
                                                <span style={{ fontSize: 12, opacity: 0.72 }}>{item.plays} 次</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* 8. Frequent Artists */}
                        {topArtists.length > 0 && (
                            <section>
                                <h2 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 12px' }}>常听歌手</h2>
                                <div className="grid grid-cols-2 gap-2.5">
                                    {topArtists.map(entry => (
                                        <button
                                            key={entry.key}
                                            type="button"
                                            onClick={() => onOpenEntity(entry, 'artist')}
                                            className="flex items-center gap-2.5 text-left"
                                            style={{ borderRadius: 16, padding: 12, background: 'var(--tingyu-surface-card, rgba(255,255,255,0.72))' }}
                                        >
                                            <div className="rounded-full flex items-center justify-center shrink-0 font-semibold" style={{ width: 38, height: 38, background: 'rgba(113,150,181,0.18)', color: '#527E9F', fontSize: 14 }}>
                                                {entry.name.slice(0, 1)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-medium" style={{ fontSize: 14 }}>{entry.name}</div>
                                                <div style={{ fontSize: 12, opacity: 0.68 }}>{entry.plays} 次 · {Math.floor(entry.seconds / 60)}分钟</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* 9. Frequent Albums */}
                        {topAlbums.length > 0 && (
                            <section>
                                <h2 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 12px' }}>常听专辑</h2>
                                <div className="grid grid-cols-3 gap-2.5">
                                    {topAlbums.map(entry => {
                                        const cover = absolutePageImage(getSongCoverUrl(entry.song));
                                        return (
                                            <button
                                                key={entry.key}
                                                type="button"
                                                onClick={() => onOpenEntity(entry, 'album')}
                                                className="text-left"
                                            >
                                                <div className="aspect-square w-full overflow-hidden mb-1.5" style={{ borderRadius: 14, background: 'rgba(113,150,181,0.16)' }}>
                                                    {cover ? (
                                                        <img src={cover} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center"><Disc3 size={24} color="#527E9F" /></div>
                                                    )}
                                                </div>
                                                <div className="truncate font-medium" style={{ fontSize: 13 }}>{entry.name}</div>
                                                <div style={{ fontSize: 12, opacity: 0.68 }}>{entry.plays} 次</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* 10. Listening Hours (24h) */}
                        <section>
                            <h2 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 12px' }}>常用收听时段</h2>
                            <div style={{ borderRadius: 16, padding: 16, background: 'var(--tingyu-surface-card, rgba(255,255,255,0.72))' }}>
                                <div className="flex items-end gap-1" style={{ height: 76 }}>
                                    {summary.hourly.map((sec, hour) => {
                                        const pct = sec > 0 ? Math.max(8, Math.round((sec / hourlyMax) * 100)) : 4;
                                        return (
                                            <div key={hour} className="flex-1 flex flex-col justify-end h-full" title={`${String(hour).padStart(2, '0')}:00 · ${Math.floor(sec / 60)}分钟`}>
                                                <div
                                                    className="w-full rounded-t"
                                                    style={{
                                                        height: `${pct}%`,
                                                        background: sec > 0 ? (hour >= 22 || hour < 6 ? '#B9BCD9' : '#7196B5') : 'rgba(113,150,181,0.15)',
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-between mt-2" style={{ fontSize: 12, opacity: 0.68 }}>
                                    <span>00:00</span>
                                    <span>06:00</span>
                                    <span>12:00</span>
                                    <span>18:00</span>
                                    <span>23:00</span>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* 11. Statistical Rules Note */}
                <p style={{ fontSize: 12, opacity: 0.68, marginTop: 24, lineHeight: 1.55 }}>
                    仅统计听屿记录到的、单会话不少于 30 秒的真实有效收听时长（含后台与锁屏播放，不含暂停、缓冲与 Seek 跳过时间）；不以歌曲总时长补算旧记录。
                    {summary.firstRecordedAt ? ` 统计起始日期：${new Date(summary.firstRecordedAt).toLocaleDateString()}。` : ''}
                    {truncated ? ' 当前基于最近 50,000 条记录汇总。' : ''}
                </p>
            </div>

            {menuOpen && (
                <MobileSheet title="音乐足迹管理" onClose={() => setMenuOpen(false)}>
                    <div className="flex flex-col gap-2 pb-4">
                        <p className="text-[12px] opacity-75 m-0 mb-2 leading-relaxed">
                            清空有效收听统计将重置所有时间范围的时长、次数及基于有效收听的「百听不厌」「好久不见」统计，同时会影响依赖收听记录的时光雷达依据；不会删除最近播放、收藏、原始歌单、本地音乐文件或音频缓存。
                        </p>
                        <button
                            type="button"
                            onClick={() => { setMenuOpen(false); onClearStats(); }}
                            className="w-full rounded-2xl py-3.5 text-[15px] font-semibold text-red-500 border border-red-500/30"
                        >
                            清空有效收听统计
                        </button>
                    </div>
                </MobileSheet>
            )}
        </div>,
        document.body,
    );
}

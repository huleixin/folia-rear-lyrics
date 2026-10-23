import type { MediaId, OnlineProviderId } from './onlineMusic';

// src/types/search.ts
// 听屿综合搜索的跨层契约：分类、能力、建议、结果页。UI、store 与 provider 共用这一份，
// 避免每个音源各自定义一遍形状。只描述「音源真实返回了什么」，不在这里推导或补全条目。

/** 搜索结果的四个内容分类。'综合' 不是数据分类，只是 UI 组合方式。 */
export type SearchCategory = 'song' | 'artist' | 'album' | 'playlist';

/** 音源实际声明支持的搜索能力；没声明的一律视为不支持，界面不显示对应分类。 */
export interface SearchCapabilities {
    song: boolean;
    artist: boolean;
    album: boolean;
    playlist: boolean;
    /** 输入过程中的联想；false 时不发送任何联想请求。 */
    suggest: boolean;
    /** 平台是否有稳定的综合搜索接口。没有时由客户端分别请求，并各自独立处理失败。 */
    general: boolean;
}

export interface SearchArtistHit {
    providerId: OnlineProviderId;
    id: MediaId;
    name: string;
    coverUrl?: string;
    /** 上游给出的辅助信息，例如「430 首歌 · 59 张专辑」；拿不到就不显示。 */
    description?: string;
    songCount?: number;
    albumCount?: number;
    aliases?: string[];
}

export interface SearchAlbumHit {
    providerId: OnlineProviderId;
    id: MediaId;
    name: string;
    coverUrl?: string;
    artistName?: string;
    /** 上游的发行日期原文；只用于展示与排序，不猜缺失值。 */
    releaseDate?: string;
    trackCount?: number;
}

export interface SearchPlaylistHit {
    providerId: OnlineProviderId;
    id: MediaId;
    name: string;
    coverUrl?: string;
    creatorName?: string;
    trackCount?: number;
    description?: string;
    playCount?: number;
}

export interface SearchHitMap {
    artist: SearchArtistHit;
    album: SearchAlbumHit;
    playlist: SearchPlaylistHit;
}

export interface SearchPage<T> {
    items: T[];
    total?: number;
    hasMore: boolean;
    nextOffset: number;
}

/**
 * 输入联想的一条。`keyword` 是上游给出的搜索词；其余三类是可直接进入详情的真实条目，
 * 标题与封面都来自上游，不用关键词拼装。
 */
export type SearchSuggestion =
    | { kind: 'keyword'; text: string; hot?: boolean }
    | { kind: 'artist'; hit: SearchArtistHit }
    | { kind: 'song'; id: MediaId; name: string; artistName?: string; coverUrl?: string }
    | { kind: 'album'; hit: SearchAlbumHit };

export interface SearchSuggestions {
    items: SearchSuggestion[];
    /** 上游明确声明「没有更多」时为 false；未知时省略。 */
    truncated?: boolean;
}

/** 各分类在综合页的第一屏条数；分类页使用独立分页。 */
export const SEARCH_OVERVIEW_LIMIT = 3;
export const SEARCH_PAGE_LIMIT = 20;

/** 建议最多展示的条数，避免一次请求把整块屏幕占满。 */
export const SEARCH_SUGGESTION_LIMIT = 8;

export const SEARCH_CATEGORY_ORDER: readonly SearchCategory[] = ['song', 'artist', 'playlist', 'album'];

export const emptySearchCapabilities: SearchCapabilities = {
    song: false, artist: false, album: false, playlist: false, suggest: false, general: false,
};

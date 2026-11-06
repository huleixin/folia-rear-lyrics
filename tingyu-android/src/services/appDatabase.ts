import Dexie, { type Table } from 'dexie';
import type { LocalSong } from '../types';
import type { LocalLibraryAssignment, LocalLibraryEntity } from '../types/localLibrary';
import type { LocalCoverAsset } from '../types/localCover';
import { migrateLegacyLocalSongRecords } from './localLibraryV8Migration';

// src/services/appDatabase.ts
// Owns the complete typed Dexie schema for local songs, entities, and content-addressed cover assets.

export const APP_DATABASE_NAME = 'KineticPlayerDB';
export const APP_DATABASE_VERSION_CHANGE_EVENT = 'folia-database-version-change';
export const LOCAL_LIBRARY_BOOTSTRAP_MARKER_KEY = 'local_library_entities_bootstrap_v1';
export const LOCAL_LIBRARY_ARTIST_SPLIT_MARKER_KEY = 'local_library_artist_delimiter_split_v1';

export interface StoredCacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;
}

export interface ThemeRegistryRecord {
  fingerprint: string;
  [key: string]: unknown;
}

/** 本地歌播放记录（local_play_history）。只存 id 与统计，名称/封面播放时从曲库现读。 */
export interface LocalPlayHistoryRecord {
  songId: string;
  playCount: number;
  lastPlayedAt: number;
  firstPlayedAt: number;
}

export class AppDatabase extends Dexie {
  appearance_profiles!: Table<{id:string;data:unknown},string>;
  session!: Table<unknown, string>;
  api_cache!: Table<StoredCacheEntry, string>;
  user_cache!: Table<StoredCacheEntry, string>;
  media_cache!: Table<StoredCacheEntry, string>;
  metadata_cache!: Table<StoredCacheEntry, string>;
  local_music!: Table<LocalSong, string>;
  theme_registry!: Table<ThemeRegistryRecord, string>;
  local_library_entities!: Table<LocalLibraryEntity, string>;
  local_library_assignments!: Table<LocalLibraryAssignment, string>;
  local_cover_assets!: Table<LocalCoverAsset, string>;
  /** 本地歌的播放记录（只存 songId + 次数 + 最近时间；展示用的元数据现场从曲库 join）。 */
  local_play_history!: Table<LocalPlayHistoryRecord, string>;

  constructor(name = APP_DATABASE_NAME) {
    super(name);

    this.version(0.6).stores({
      session: '',
      api_cache: 'key',
      user_cache: 'key',
      media_cache: 'key',
      metadata_cache: 'key',
      local_music: 'id',
      theme_registry: 'fingerprint',
    });

    this.version(0.7).stores({
      session: '',
      api_cache: 'key',
      user_cache: 'key',
      media_cache: 'key',
      metadata_cache: 'key',
      local_music: 'id',
      theme_registry: 'fingerprint',
      local_library_entities: 'id, kind, *normalizedAliases, mergedInto, needsReview, createdAt',
      local_library_assignments: 'songId, *artistEntityIds, albumEntityId, artistOrigin, albumOrigin',
    });

    this.version(0.8).stores({
      session: '',
      api_cache: 'key',
      user_cache: 'key',
      media_cache: 'key',
      metadata_cache: 'key',
      local_music: 'id',
      theme_registry: 'fingerprint',
      local_library_entities: 'id, kind, *normalizedAliases, mergedInto, needsReview, createdAt',
      local_library_assignments: 'songId, *artistEntityIds, albumEntityId, artistOrigin, albumOrigin',
    }).upgrade(async transaction => {
      const legacySongs = await transaction.table<LocalSong, string>('local_music').toArray();
      const migrated = migrateLegacyLocalSongRecords(legacySongs as Array<LocalSong & Record<string, unknown>>);
      await Promise.all([
        transaction.table('local_music').bulkPut(migrated.songs),
        transaction.table('local_library_entities').clear().then(() => (
          transaction.table('local_library_entities').bulkPut(migrated.entities)
        )),
        transaction.table('local_library_assignments').clear().then(() => (
          transaction.table('local_library_assignments').bulkPut(migrated.assignments)
        )),
      ]);
    });

    this.version(0.9).stores({
      session: '',
      api_cache: 'key',
      user_cache: 'key',
      media_cache: 'key',
      metadata_cache: 'key',
      local_music: 'id, localCoverAssetId',
      theme_registry: 'fingerprint',
      local_library_entities: 'id, kind, *normalizedAliases, mergedInto, needsReview, createdAt',
      local_library_assignments: 'songId, *artistEntityIds, albumEntityId, artistOrigin, albumOrigin',
      local_cover_assets: 'id',
    });

    this.version(1).stores({appearance_profiles:'id'});

    // v2：本地歌播放历史。本地推荐首页的「常听精选 / 最近播放 / 常听专辑 / 久未播放」都靠它；
    // 在线歌的历史仍在 localStorage（useMobileLibraryStore），两边互不混写。
    this.version(2).stores({
      session: '',
      api_cache: 'key',
      user_cache: 'key',
      media_cache: 'key',
      metadata_cache: 'key',
      local_music: 'id, localCoverAssetId',
      theme_registry: 'fingerprint',
      local_library_entities: 'id, kind, *normalizedAliases, mergedInto, needsReview, createdAt',
      local_library_assignments: 'songId, *artistEntityIds, albumEntityId, artistOrigin, albumOrigin',
      local_cover_assets: 'id',
      appearance_profiles: 'id',
      local_play_history: 'songId, lastPlayedAt',
    });

    this.on('versionchange', event => {
      this.close();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(APP_DATABASE_VERSION_CHANGE_EVENT, {
          detail: { oldVersion: event.oldVersion, newVersion: event.newVersion },
        }));
        window.setTimeout(() => window.location.reload(), 0);
      }
    });
  }
}

export const appDatabase = new AppDatabase();

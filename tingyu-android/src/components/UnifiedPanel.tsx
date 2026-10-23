import React from 'react';
import type { Album, Artist, SongResult, Theme, PlayerState, ReplayGainMode, ThemeMode, VisualizerMode, OnlineLyricsState } from '../types';
import type { ProviderUser, AudioQualityPreference } from '../types/onlineMusic';
import type { LibraryAccountController } from '../library/core/contracts/account';
import type { ThemeSourceModel } from '../hooks/themeControllerState';
import MobilePlayerSheet from './mobile-player/MobilePlayerSheet';

// src/components/UnifiedPanel.tsx
// Legacy panel tab ids are accepted by the adapter; all visible tools use the mobile sheet.
export type PanelTab = 'cover' | 'controls' | 'queue' | 'account' | 'local' | 'navi' | 'onlineLyrics'
    // Tabs registered by Folium mods (registries.playerPanelTabs).
    | `folium:${string}`;

type UnifiedPanelPlaybackProps = {
    isOpen: boolean;
    currentTab: PanelTab;
    onTabChange: (tab: PanelTab) => void;
    onToggle: () => void;
    onNavigateHome: () => void;
    onNavigateHomeDirect: () => void;
    coverUrl: string | null;
    currentSong: SongResult | null;
    onAlbumSelect: (song: SongResult, album: Album) => void;
    onSelectArtist: (song: SongResult, artist: Artist) => void;
    loopMode: 'off' | 'all' | 'one';
    onToggleLoop: () => void;
    onLike: () => void;
    isLiked: boolean;
    onGenerateAITheme: () => void;
    isGeneratingTheme: boolean;
    hasLyrics: boolean;
    canGenerateAITheme: boolean;
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
    bgMode: ThemeMode;
    onBgModeChange: (mode: ThemeMode) => void;
    hasCustomTheme: boolean;
    themeSourceModel: ThemeSourceModel;
    onResetTheme: () => void;
    defaultTheme: Theme;
    daylightTheme: Theme;
    visualizerMode: VisualizerMode;
    onVisualizerModeChange: (mode: VisualizerMode) => void;
    onMatchOnline: () => void;
    onUpdateLocalLyrics: (content: string, isTranslation: boolean, fileName?: string) => void;
    onChangeLyricsSource: (source: 'local' | 'embedded' | 'online') => void;
    onlineLyricsState: OnlineLyricsState | null;
    onImportOnlineLyrics: (content: string, fileName: string) => void;
    onChangeOnlineLyricsSource: (source: 'online' | 'imported') => void;
    onMatchOnlineLyrics: () => void;
    onClearOnlineLyricsState: () => void;
    lyricTimelineOffsetMs: number;
    onLyricTimelineOffsetChange: (offsetMs: number) => void;
    replayGainMode: ReplayGainMode;
    onChangeReplayGainMode: (mode: ReplayGainMode) => void;
    isFmMode: boolean;
    fmModeLabel: string;
    onOpenFmModePicker?: () => void;
    onFmTrash: () => void;
    onNextTrack: () => void;
    onPrevTrack: () => void;
    playerState: PlayerState;
    onTogglePlay: () => void;
    volume: number;
    isMuted: boolean;
    onVolumePreview: (val: number) => void;
    onVolumeChange: (val: number) => void;
    onToggleMute: () => void;
    showOpenPanelCloseButton: boolean;
    isPanelGuideHotspotActive?: boolean;
    hideToggleButton?: boolean;
    isStageContext?: boolean;
    playbackControlsDisabled?: boolean;
    onOpenSettings?: () => void;
    onOpenCommandPalette?: () => void;
    isCommandPaletteOpen?: boolean;
    transparentPlayerBackground: boolean;
    onToggleTransparentPlayerBackground: (enable: boolean) => void;
};

type UnifiedPanelQueueProps = {
    playQueue: SongResult[];
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
    queueScrollRef: React.RefObject<HTMLDivElement | null>;
    onShuffle: () => void;
    onRemoveSong: (index: number) => void;
    onMoveSongToEnd: (index: number) => void;
    onMoveSongToNext: (index: number) => void;
    onOpenLattice?: () => void;
};

type UnifiedPanelAccountProps = {
    user: ProviderUser | null;
    accountController: LibraryAccountController;
    audioQuality: AudioQualityPreference;
    onAudioQualityChange: (quality: AudioQualityPreference) => void;
    cacheSize: string;
    onClearCache: () => void;
    onSyncData: () => void;
    isSyncing: boolean;
    useCoverColorBg: boolean;
    onToggleCoverColorBg: (enable: boolean) => void;
    isDaylight: boolean;
    onToggleDaylight: () => void;
};

type UnifiedPanelLibraryProps = {
    onSaveCurrentQueueAsPlaylist: (name: string) => Promise<void>;
    onOpenCurrentLocalAlbum: () => void;
    onOpenCurrentLocalArtist: (entityId?: string) => void;
    onOpenCurrentNavidromeAlbum: () => void;
    onOpenCurrentNavidromeArtist: () => void;
    onCopySongInfoSuccess: () => void;
};

export type UnifiedPanelProps = {
    playback: UnifiedPanelPlaybackProps;
    queue: UnifiedPanelQueueProps;
    library: UnifiedPanelLibraryProps;
    account: UnifiedPanelAccountProps;
};

const UnifiedPanel: React.FC<UnifiedPanelProps> = (props) => props.playback.isOpen ? <MobilePlayerSheet {...props} /> : null;
export default React.memo(UnifiedPanel);

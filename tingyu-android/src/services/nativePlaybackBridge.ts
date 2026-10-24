import { PlayerState } from '../types';
import { currentTime } from '../stores/motionSignals';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { createProviderSongMetadata } from '../utils/songMetadata';
import {
  selectDisplayDuration,
  selectDisplayPlayerState,
  selectDisplaySong,
  usePlaybackStore,
} from '../stores/usePlaybackStore';

type NativePlaybackPlugin = {
  updatePlaybackState: (state: Record<string, unknown>) => Promise<unknown>;
  clearPlaybackState: () => Promise<unknown>;
  addListener: (
    eventName: string,
    listener: (event: { action?: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
};

let installed = false;

type NativePlaybackPayload = {
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  songKey: string;
  playing: boolean;
  position: number;
  duration: number;
};

const milliseconds = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

export const buildNativePlaybackPayload = (
  song: NonNullable<ReturnType<typeof selectDisplaySong>>, playing: boolean, positionSeconds: number, durationSeconds: number,
): NativePlaybackPayload => {
  const metadata = createProviderSongMetadata(song);
  return {
    title: song.name || 'Unknown Song',
    artist: metadata.artists.map(artist => artist.name).filter(Boolean).join(' / '),
    album: metadata.album.name,
    coverUrl: metadata.coverUrl || (song as unknown as { coverUrl?: string }).coverUrl || '',
    songKey: getPlaybackSongKey(song),
    playing,
    position: milliseconds(positionSeconds * 1000),
    duration: milliseconds(durationSeconds > 0 ? durationSeconds * 1000 : metadata.durationMs),
  };
};

const readPayload = (): NativePlaybackPayload | null => {
  const state = usePlaybackStore.getState();
  const song = selectDisplaySong(state);
  return song ? buildNativePlaybackPayload(song, selectDisplayPlayerState(state) === PlayerState.PLAYING,
    currentTime.get(), selectDisplayDuration(state)) : null;
};

/**
 * 锁屏元数据里真正会变的东西。
 *
 * store 的订阅回调对任何一次写入都会跑，而每次推送都会让原生侧重走一遍前台服务启动
 * （构建通知 + `startForeground` + 写诊断）——现场报告里 4 秒内攒了 20 次 `service-start`，
 * 就是这个订阅在没有去重的情况下被播放中的状态写入反复触发。
 *
 * 位置不在 store 里（走 motionSignals），所以这里按内容去重：只有这些字段变化才立刻重发，
 * 播放进度交给低频心跳；系统用 PlaybackState 时钟自行插值。
 */
export const buildNativePlaybackIdentity = (payload: NativePlaybackPayload): string => JSON.stringify([
  payload.title,
  payload.artist,
  payload.album,
  payload.coverUrl,
  payload.songKey,
  payload.playing,
  payload.duration,
]);

/** Serializes bridge writes and keeps only the newest pending state. Failed writes stay retryable. */
export const createNativePlaybackPublisher = (plugin: Pick<NativePlaybackPlugin, 'updatePlaybackState' | 'clearPlaybackState'>) => {
  let acknowledged: string | undefined;
  let active = false;
  let pending: { payload: NativePlaybackPayload | null; force: boolean } | null = null;
  return (payload: NativePlaybackPayload | null, { force = false }: { force?: boolean } = {}): void => {
    pending = { payload, force };
    if (active) return;
    active = true;
    void (async () => {
      try {
        while (pending) {
          const next = pending;
          pending = null;
          const identity = next.payload ? buildNativePlaybackIdentity(next.payload) : '__empty__';
          if (!next.force && acknowledged === identity) continue;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const work = next.payload ? plugin.updatePlaybackState({ ...next.payload }) : plugin.clearPlaybackState();
            await Promise.race([work, new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Native media publication timed out')), 4000);
            })]);
            acknowledged = identity;
          } catch (error) {
            // Do not acknowledge a dropped native write. The periodic/visibility sync retries it.
            console.warn('[FoliaNativePlayback] Failed to publish media state', error);
          } finally { clearTimeout(timer); }
        }
      } finally { active = false; }
    })();
  };
};

export const installNativePlaybackBridge = async (
  plugin: NativePlaybackPlugin,
): Promise<void> => {
  if (installed) return;
  installed = true;

  // Listener registration is independent of metadata/API readiness; a lost listener reply must
  // not hold every native API request behind it during startup.
  void (async () => {
    try {
      await plugin.addListener('mediaAction', ({ action }) => {
        if (!action) return;
        window.dispatchEvent(new CustomEvent('folia-native-media-action', {
          detail: { action },
        }));
      });
    } catch (error) {
      console.warn('[FoliaNativePlayback] Failed to listen for media actions', error);
    }
  })();

  const publish = createNativePlaybackPublisher(plugin);
  const pushState = (force = false) => publish(readPayload(), { force });
  usePlaybackStore.subscribe(() => pushState());
  window.setInterval(() => {
    const state = usePlaybackStore.getState();
    pushState(selectDisplayPlayerState(state) === PlayerState.PLAYING);
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pushState(true);
  });
  pushState();
};

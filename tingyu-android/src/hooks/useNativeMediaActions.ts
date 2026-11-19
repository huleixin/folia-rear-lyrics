import { useEffect } from 'react';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { isPlaybackFailureStatus } from '../services/playbackRecovery/playbackFailurePolicy';
import i18n from '../i18n/config';

// Native media events are fire-and-forget; surface rejected commands without an unhandled Promise.
function runMediaAction(action: () => void | Promise<void>) {
  void Promise.resolve().then(action).catch(error => {
    if (error?.name === 'AbortError') return;
    setStatusMessage(previous => isPlaybackFailureStatus(previous) ? previous : { type: 'error', text: i18n.t('status.playbackError') });
  });
}

type NativeMediaActions = {
  play: () => void | Promise<void>;
  pause: () => void | Promise<void>;
  toggle: () => void | Promise<void>;
  next: () => void | Promise<void>;
  previous: () => void | Promise<void>;
  seek: (position: number) => void;
};

export const useNativeMediaActions = (actions: NativeMediaActions) => {
  useEffect(() => {
    const listener = (event: Event) => {
      const { action, position } = (event as CustomEvent<{ action?: string; position?: number }>).detail ?? {};
      if (action === 'play') runMediaAction(actions.play);
      else if (action === 'pause') runMediaAction(actions.pause);
      else if (action === 'toggle') runMediaAction(actions.toggle);
      else if (action === 'next') runMediaAction(actions.next);
      else if (action === 'previous') runMediaAction(actions.previous);
      else if (action === 'seek' && typeof position === 'number' && Number.isFinite(position)) actions.seek(Math.max(0, position));
    };
    window.addEventListener('folia-native-media-action', listener);
    return () => window.removeEventListener('folia-native-media-action', listener);
  }, [actions.next, actions.pause, actions.play, actions.previous, actions.toggle, actions.seek]);
};

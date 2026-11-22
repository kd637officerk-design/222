import { Capacitor, registerPlugin } from '@capacitor/core';

export const DEFAULT_COVER_ART = '/assets/aistudio/Arte_de_Stefano_Daddato__d4ed462a.jpg';

export type SystemMediaAction =
  | 'play'
  | 'pause'
  | 'stop'
  | 'rerun'
  | 'prev'
  | 'next'
  | 'seekback'
  | 'seekforward'
  | 'seekto';

export interface SystemMediaActionEvent {
  action: SystemMediaAction;
  position?: number;
}

export interface ScannedInternalMediaFile {
  name: string;
  artist?: string;
  album?: string;
  folder: string;
  kind: 'audio' | 'video';
  uri: string;
  size?: number;
  duration?: number;
  mimeType?: string;
}

interface AndroidMediaPluginInterface {
  updateMetadata(opts: {
    title: string;
    artist: string;
    album: string;
    artworkUrl?: string;
    isPlaying: boolean;
    durationSec: number;
    positionSec: number;
  }): Promise<void>;
  stopNotification(): Promise<void>;
  addListener(
    eventName: 'mediaAction',
    listenerFunc: (event: SystemMediaActionEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

interface InternalFilesPluginInterface {
  requestStoragePermission(): Promise<{ granted: boolean }>;
  scanMedia(): Promise<{ files: ScannedInternalMediaFile[] }>;
}

const AndroidMediaPlugin = Capacitor.isNativePlatform()
  ? registerPlugin<AndroidMediaPluginInterface>('AndroidMedia')
  : null;

const InternalFilesPlugin = Capacitor.isNativePlatform()
  ? registerPlugin<InternalFilesPluginInterface>('InternalFiles')
  : null;

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function resolveAbsoluteArtUrl(art?: string): string {
  const rel = art || DEFAULT_COVER_ART;
  try {
    return new URL(rel, window.location.origin).href;
  } catch {
    return rel;
  }
}

export function registerWebMediaSessionHandlers(handlers: {
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeekBackward: (offsetSec?: number) => void;
  onSeekForward: (offsetSec?: number) => void;
  onSeekTo: (timeSec: number) => void;
}) {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const safeSet = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // Unsupported action handler in this browser
      }
    };
    safeSet('play', () => handlers.onPlay());
    safeSet('pause', () => handlers.onPause());
    safeSet('stop', () => handlers.onStop());
    safeSet('previoustrack', () => handlers.onPrev());
    safeSet('nexttrack', () => handlers.onNext());
    safeSet('seekbackward', (details) => handlers.onSeekBackward(details?.seekOffset || 10));
    safeSet('seekforward', (details) => handlers.onSeekForward(details?.seekOffset || 10));
    safeSet('seekto', (details) => {
      if (typeof details?.seekTime === 'number' && isFinite(details.seekTime)) {
        handlers.onSeekTo(details.seekTime);
      }
    });
  }

  let nativeHandle: { remove: () => Promise<void> } | null = null;
  let cancelled = false;

  if (AndroidMediaPlugin) {
    AndroidMediaPlugin.addListener('mediaAction', (ev) => {
      if (ev.action === 'play') handlers.onPlay();
      else if (ev.action === 'pause') handlers.onPause();
      else if (ev.action === 'stop') handlers.onStop();
      else if (ev.action === 'rerun') handlers.onSeekTo(0);
      else if (ev.action === 'prev') handlers.onPrev();
      else if (ev.action === 'next') handlers.onNext();
      else if (ev.action === 'seekback') handlers.onSeekBackward(10);
      else if (ev.action === 'seekforward') handlers.onSeekForward(10);
      else if (ev.action === 'seekto' && typeof ev.position === 'number') {
        handlers.onSeekTo(ev.position);
      }
    })
      .then((h) => {
        if (cancelled) h.remove().catch(() => {});
        else nativeHandle = h;
      })
      .catch(() => {});
  }

  return () => {
    cancelled = true;
    nativeHandle?.remove().catch(() => {});
  };
}

export function syncSystemMediaMetadata(opts: {
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  isPlaying: boolean;
  isStopped?: boolean;
  durationSec: number;
  positionSec: number;
  playbackRate?: number;
}) {
  const art = resolveAbsoluteArtUrl(opts.artworkUrl);

  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      const ms = navigator.mediaSession;
      if (typeof MediaMetadata !== 'undefined') {
        ms.metadata = new MediaMetadata({
          title: opts.title,
          artist: opts.artist,
          album: opts.album,
          artwork: [
            { src: art, sizes: '512x512', type: art.endsWith('.png') ? 'image/png' : 'image/jpeg' },
            { src: `${window.location.origin}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
            { src: `${window.location.origin}/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          ],
        });
      }
      ms.playbackState = opts.isStopped ? 'none' : opts.isPlaying ? 'playing' : 'paused';
      if (
        typeof ms.setPositionState === 'function' &&
        isFinite(opts.durationSec) &&
        opts.durationSec > 0
      ) {
        ms.setPositionState({
          duration: opts.durationSec,
          playbackRate: opts.playbackRate || 1,
          position: Math.min(opts.durationSec, Math.max(0, opts.positionSec || 0)),
        });
      }
    } catch {
      // Ignore partial MediaSession errors
    }
  }

  if (AndroidMediaPlugin) {
    if (opts.isStopped) {
      AndroidMediaPlugin.stopNotification().catch(() => {});
    } else {
      AndroidMediaPlugin.updateMetadata({
        title: opts.title,
        artist: opts.artist,
        album: opts.album,
        artworkUrl: art,
        isPlaying: opts.isPlaying,
        durationSec: opts.durationSec || 0,
        positionSec: opts.positionSec || 0,
      }).catch(() => {});
    }
  }
}

export async function scanNativeInternalFiles(): Promise<ScannedInternalMediaFile[] | null> {
  if (!InternalFilesPlugin) return null;
  const perm = await InternalFilesPlugin.requestStoragePermission();
  if (!perm.granted) {
    throw new Error('Storage permission denied');
  }
  const res = await InternalFilesPlugin.scanMedia();
  return (res.files || []).map((f) => ({
    ...f,
    uri: f.uri.startsWith('content://') ? f.uri : Capacitor.convertFileSrc(f.uri),
  }));
}

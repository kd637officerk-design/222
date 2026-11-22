import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  FileText,
  Heart,
  Image as ImageIcon,
  Info,
  MessageSquare,
  MoreVertical,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import { fetchOnlineLyrics, formatTime, parseLRC, transcribeTrackLyrics } from '../utils/mediaParsers';
import { Track } from '../types/player';

interface NowPlayingViewProps {
  open: boolean;
  track: Track | null;
  coverUrl?: string;
  fallbackArtUrl?: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isFav: boolean;
  playMode: 'seq' | 'all' | 'one' | 'shuf';
  normEnabled?: boolean;
  normTarget?: 'warm' | 'balanced' | 'loud';
  normGainDb?: number;
  onToggleNorm?: () => void;
  onClose: () => void;
  onTogglePlay: () => void;
  onStop?: () => void;
  onRerun?: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (sec: number) => void;
  onSeekRelative?: (deltaSec: number) => void;
  onVolumeChange: (v: number) => void;
  onToggleFav: () => void;
  onCycleMode: () => void;
  onOpenOptions: () => void;
  onOpenMore: () => void;
  onOpenNotes: () => void;
  onOpenArtViewer: () => void;
  onEditLyrics: () => void;
  onSaveAutoLyrics: (trackId: number, lyr: string) => void;
  onToast: (msg: string) => void;
}

export const NowPlayingView: React.FC<NowPlayingViewProps> = ({
  open,
  track,
  coverUrl,
  fallbackArtUrl,
  playing,
  currentTime,
  duration,
  volume,
  isFav,
  playMode,
  normEnabled = true,
  normTarget = 'balanced',
  normGainDb = 0,
  onToggleNorm,
  onClose,
  onTogglePlay,
  onStop,
  onRerun,
  onPrev,
  onNext,
  onSeek,
  onSeekRelative,
  onVolumeChange,
  onToggleFav,
  onCycleMode,
  onOpenOptions,
  onOpenMore,
  onOpenNotes,
  onOpenArtViewer,
  onEditLyrics,
  onSaveAutoLyrics,
  onToast,
}) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [searchingLyrics, setSearchingLyrics] = useState(false);
  const [transcribeStage, setTranscribeStage] = useState<string | null>(null);
  const lyrBoxRef = useRef<HTMLDivElement | null>(null);
  const swipeStart = useRef<{ y: number; t: number } | null>(null);

  const lrcLines = useMemo(() => parseLRC(track?.lyr), [track?.lyr]);
  const displayArtUrl = coverUrl || fallbackArtUrl;

  const activeLrcIndex = useMemo(() => {
    if (!lrcLines) return -1;
    const ct = currentTime + 0.15;
    let idx = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].t <= ct) idx = i;
      else break;
    }
    return idx;
  }, [lrcLines, currentTime]);

  useEffect(() => {
    if (!showLyrics || activeLrcIndex < 0 || !lyrBoxRef.current) return;
    const el = lyrBoxRef.current.querySelector(`[data-lrc-idx="${activeLrcIndex}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeLrcIndex, showLyrics]);

  useEffect(() => {
    if (!open) {
      setUiHidden(false);
    }
  }, [open]);

  if (!open) return null;

  const pct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleFindOnline = async () => {
    if (!track) return;
    if (!track.artist?.trim()) {
      onToast('Add the artist name in Edit tags first');
      return;
    }
    setSearchingLyrics(true);
    const found = await fetchOnlineLyrics(track.artist, track.name);
    setSearchingLyrics(false);
    if (found) {
      onSaveAutoLyrics(track.id, found);
      onToast('Lyrics loaded');
    } else {
      onToast('No online match found — tap Transcribe Song or Edit lyrics');
    }
  };

  const handleTranscribeSong = async (synced = true) => {
    if (!track || transcribeStage) return;
    const trackId = track.id;
    try {
      setTranscribeStage('Preparing audio…');
      const lyrics = await transcribeTrackLyrics(track, {
        synced,
        onStage: (s) => setTranscribeStage(s),
      });
      onSaveAutoLyrics(trackId, lyrics);
      onToast(synced ? 'Synced .lrc lyrics transcribed!' : 'Lyrics transcribed!');
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setTranscribeStage(null);
    }
  };

  const renderModeIcon = () => {
    if (playMode === 'one') return <Repeat1 className="w-5 h-5" />;
    if (playMode === 'shuf') return <Shuffle className="w-5 h-5" />;
    return <Repeat className={`w-5 h-5 ${playMode === 'all' ? 'text-white' : 'opacity-60'}`} />;
  };

  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden bg-[#120e0a] text-white flex flex-col"
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).closest('button,input')) return;
        if (showLyrics && (lyrBoxRef.current?.scrollTop ?? 0) > 2) return;
        swipeStart.current = { y: e.touches[0].clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        if (!swipeStart.current) return;
        const dy = e.changedTouches[0].clientY - swipeStart.current.y;
        const dt = Date.now() - swipeStart.current.t;
        swipeStart.current = null;
        if (dy > 110 && dt < 500) onClose();
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,input,a')) return;
        if (!showLyrics) setUiHidden((prev) => !prev);
      }}
    >
      {/* Full-bleed Ambient Artwork Blur Sampling Backdrop */}
      {displayArtUrl && (
        <div
          className="pointer-events-none absolute -inset-16 bg-cover bg-center blur-3xl opacity-70 scale-125 transition-all duration-700"
          style={{ backgroundImage: `url("${displayArtUrl}")` }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-black/92" />

      {/* Minimal Top Bar */}
      <div
        className={`relative z-10 shrink-0 flex items-center justify-between px-4 pt-3 pb-1 transition-opacity duration-200 ${
          uiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/10"
          aria-label="Minimize Now Playing"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">
          {track?.kind === 'book' ? 'Audiobook' : 'Now Playing'}
        </div>
        <button
          type="button"
          onClick={onOpenMore}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/10"
          aria-label="Track options"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content: Tall Portrait/Poster Art Top + Clean Controls Bottom (2-col on Desktop) */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto touch-pan-y max-w-6xl w-full mx-auto px-5 pb-5 flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-10 items-center justify-between lg:justify-center">
        {/* Artwork or Lyrics Panel */}
        <div className="lg:col-span-6 w-full flex-1 lg:flex-initial flex flex-col items-center justify-center min-h-0 pt-1">
          {showLyrics ? (
            <div
              ref={lyrBoxRef}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-[46dvh] lg:h-[68vh] overflow-y-auto touch-pan-y mat-panel rounded-2xl p-5 space-y-3"
            >
              <div className="flex flex-wrap gap-2 pb-2 border-b border-white/10">
                {track?.kind === 'audio' && (
                  <button
                    type="button"
                    onClick={() => handleTranscribeSong(true)}
                    disabled={!!transcribeStage}
                    className="min-h-[40px] px-3.5 rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-60 text-xs font-extrabold flex items-center gap-1.5 shadow"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${transcribeStage ? 'animate-spin' : ''}`} />
                    {transcribeStage || (track?.lyr ? 'Re-transcribe Song' : 'Transcribe Song')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onEditLyrics}
                  className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold"
                >
                  ✎ {track?.lyr ? 'Edit Lyrics' : 'Add Lyrics'}
                </button>
                {track?.kind === 'audio' && (
                  <button
                    type="button"
                    onClick={handleFindOnline}
                    disabled={searchingLyrics || !!transcribeStage}
                    className="min-h-[40px] px-3 rounded-xl bg-[var(--or)]/20 border border-[var(--or)]/40 text-xs font-bold text-[var(--pe)]"
                  >
                    {searchingLyrics ? 'Searching...' : '🔎 Find Online'}
                  </button>
                )}
              </div>

              {lrcLines ? (
                <div className="space-y-2.5 py-2">
                  {lrcLines.map((line, i) => (
                    <button
                      key={i}
                      type="button"
                      data-lrc-idx={i}
                      onClick={() => onSeek(Math.max(0, line.t))}
                      className={`block w-full text-left text-lg leading-relaxed transition-all ${
                        i === activeLrcIndex
                          ? 'text-[var(--pe)] font-bold scale-[1.01]'
                          : 'text-white/55 hover:text-white/85'
                      }`}
                    >
                      {line.s || '♪'}
                    </button>
                  ))}
                </div>
              ) : track?.lyr?.trim() ? (
                <div className="whitespace-pre-wrap text-base leading-relaxed text-white/85">
                  {track.lyr.trim()}
                </div>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <div className="text-sm text-white/70">
                    {transcribeStage || 'No lyrics added for this song yet.'}
                  </div>
                  {track?.kind === 'audio' && (
                    <button
                      type="button"
                      onClick={() => handleTranscribeSong(true)}
                      disabled={!!transcribeStage}
                      className="min-h-[44px] px-5 mx-auto rounded-full bg-white text-black font-extrabold text-xs inline-flex items-center gap-2 shadow-lg hover:scale-[1.02] transition disabled:opacity-60"
                    >
                      <Sparkles className={`w-4 h-4 ${transcribeStage ? 'animate-spin' : ''}`} />
                      {transcribeStage || 'Transcribe Lyrics from Audio'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onOpenArtViewer();
              }}
              className="relative flex items-center justify-center w-full cursor-pointer"
              title="Tap to inspect full artwork"
            >
              {displayArtUrl ? (
                <img
                  src={displayArtUrl}
                  alt={track?.name || 'Album artwork'}
                  className="max-h-[48dvh] sm:max-h-[54dvh] lg:max-h-[72dvh] w-auto max-w-[92%] sm:max-w-[420px] lg:max-w-[480px] object-contain rounded-lg shadow-[0_26px_70px_rgba(0,0,0,0.8)] transition-all duration-300"
                />
              ) : (
                <div className="w-64 h-80 rounded-xl bg-black/35 flex flex-col items-center justify-center gap-3 text-white/40 shadow-2xl">
                  <Music2 className="w-20 h-20 stroke-[1.2]" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata, Action Row, Seek Bar & Transport Controls */}
        <div
          className={`lg:col-span-6 w-full max-w-md mx-auto flex flex-col justify-end lg:justify-center space-y-4 transition-opacity duration-200 ${
            uiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {/* Centered Title, Artist, Album */}
          <div className="text-center px-2 space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
              {track ? track.nick || track.name : 'Nothing playing'}
            </h2>
            <p className="text-sm text-white/75 truncate">
              {track ? track.artist || '<unknown>' : ''}
            </p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/55 truncate">
              {track ? track.album || track.folder || (track.kind === 'book' ? 'Audiobook' : 'Local Music') : ''}
            </p>
          </div>

          {/* Clean Icon Action Bar (Heart, Info/Notes, Lyrics, More, Repeat/Mode, Re-run) */}
          <div className="flex items-center justify-around px-2 text-white/85">
            <button
              type="button"
              onClick={onToggleFav}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Favorite"
              title="Favorite"
            >
              <Heart
                className={`w-5 h-5 transition-colors ${
                  isFav ? 'fill-white text-white' : 'text-white/80'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={onOpenNotes}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/10 text-white/80"
              title="Track info, links & notes"
              aria-label="Track info"
            >
              <Info className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowLyrics((v) => !v)}
              className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full transition ${
                showLyrics ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
              }`}
              title="Toggle Lyrics"
              aria-label="Lyrics"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onOpenMore}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/10 text-white/80"
              title="More options"
              aria-label="More options"
            >
              <FileText className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onOpenArtViewer}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/10 text-white/80"
              title="View full art"
              aria-label="View artwork"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onCycleMode}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/10 text-white/85"
              title="Shuffle / Repeat mode"
              aria-label="Play mode"
            >
              {renderModeIcon()}
            </button>
          </div>

          {/* Clean Horizontal Seekbar */}
          <div className="space-y-1 px-1">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="studio-range w-full h-4"
              style={{ '--p': `${pct}%` } as React.CSSProperties}
            />
            <div className="flex justify-between text-xs font-mono text-white/75">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Primary Bottom Playback Bar */}
          <div className="flex items-center justify-between px-1 pt-1">
            <button
              type="button"
              onClick={() => (onStop ? onStop() : onSeek(0))}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-red-200 transition"
              aria-label="Stop Player"
              title="Stop Player"
            >
              <Square className="w-5 h-5 fill-current" />
            </button>

            <button
              type="button"
              onClick={onPrev}
              className="min-h-[52px] min-w-[52px] flex items-center justify-center rounded-full text-white hover:bg-white/10 active:scale-95 transition"
              aria-label="Previous"
              title="Previous Track"
            >
              <SkipBack className="w-8 h-8 fill-current" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <Pause className="w-8 h-8 fill-current" />
              ) : (
                <Play className="w-8 h-8 fill-current ml-1" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              className="min-h-[52px] min-w-[52px] flex items-center justify-center rounded-full text-white hover:bg-white/10 active:scale-95 transition"
              aria-label="Next"
              title="Next Track"
            >
              <SkipForward className="w-8 h-8 fill-current" />
            </button>

            <button
              type="button"
              onClick={onOpenOptions}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition"
              title="EQ, Normalization, Speed & Sleep Timer"
              aria-label="Equalizer and Options"
            >
              <Sliders className="w-5 h-5" />
            </button>
          </div>

          {/* Secondary Quick Controls (-10s, Re-run, +10s, Gain Norm) */}
          <div className="flex items-center justify-center gap-2 pt-0.5 flex-wrap">
            <button
              type="button"
              onClick={() => (onSeekRelative ? onSeekRelative(-10) : onSeek(Math.max(0, currentTime - 10)))}
              className="min-h-[34px] px-3 rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-bold flex items-center gap-1 text-white/85"
              title="Backward 10 seconds"
            >
              <RotateCcw className="w-3.5 h-3.5" /> -10s
            </button>
            <button
              type="button"
              onClick={() => (onRerun ? onRerun() : onSeek(0))}
              className="min-h-[34px] px-3 rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-bold flex items-center gap-1 text-white/85"
              title="Re-run from 0:00"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-run
            </button>
            <button
              type="button"
              onClick={() => (onSeekRelative ? onSeekRelative(10) : onSeek(Math.min(duration || currentTime + 10, currentTime + 10)))}
              className="min-h-[34px] px-3 rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-bold flex items-center gap-1 text-white/85"
              title="Forward 10 seconds"
            >
              +10s <RotateCw className="w-3.5 h-3.5" />
            </button>
            {onToggleNorm && (
              <button
                type="button"
                onClick={onToggleNorm}
                className={`min-h-[34px] px-3 rounded-full text-[11px] font-bold border transition ${
                  normEnabled
                    ? 'bg-white/15 border-white/35 text-white'
                    : 'bg-white/5 border-white/15 text-white/55'
                }`}
                title={`Dynamic Gain Normalization (${normTarget})`}
              >
                {normEnabled
                  ? `NORM ${normGainDb ? `${normGainDb > 0 ? '+' : ''}${normGainDb.toFixed(1)}dB` : normTarget.toUpperCase()}`
                  : 'NORM OFF'}
              </button>
            )}
          </div>

          {/* Desktop Volume Slider */}
          <div className="hidden md:flex items-center gap-3 px-2 pt-1">
            <Volume2 className="w-4 h-4 text-white/65 shrink-0" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="studio-range flex-1"
              style={{ '--p': `${volume * 100}%` } as React.CSSProperties}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  AudioLines,
  Headphones,
  Repeat2,
} from 'lucide-react';
import { useStudio } from './providers';
import { Slider, Tip } from './ui';
import { MiniWave } from './visuals';
import { cn, formatTime } from '@/lib/utils';
import { getEffect } from '@/lib/data';
import type WaveSurfer from 'wavesurfer.js';
export function AudioWaveform({
  url,
  time = 0,
  onSeek,
  className,
  color = '#5c6e9d',
  progressColor = '#86c7eb',
  height = 72,
}: {
  url: string;
  time?: number;
  onSeek?: (time: number) => void;
  className?: string;
  color?: string;
  progressColor?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const [ready, setReady] = useState(false);
  const callbackRef = useRef(onSeek);
  callbackRef.current = onSeek;
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    import('wavesurfer.js')
      .then(({ default: WaveSurfer }) => {
        if (cancelled || !ref.current) return;
        const wave = WaveSurfer.create({
          container: ref.current,
          url,
          waveColor: color,
          progressColor,
          cursorColor: '#b7eafa',
          cursorWidth: 1.5,
          barWidth: 2,
          barGap: 2,
          barRadius: 2,
          height,
          normalize: true,
          interact: true,
          hideScrollbar: true,
          fillParent: true,
          dragToSeek: true,
        });
        waveRef.current = wave;
        wave.on('ready', () => {
          if (!cancelled) setReady(true);
        });
        wave.on('interaction', (position) => callbackRef.current?.(position));
        wave.on('error', () => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      waveRef.current?.destroy();
      waveRef.current = null;
    };
  }, [url, color, progressColor, height]);
  useEffect(() => {
    if (ready && waveRef.current && Math.abs(waveRef.current.getCurrentTime() - time) > 0.08)
      waveRef.current.setTime(time);
  }, [time, ready]);
  return (
    <div className={cn('audio-waveform', className)} style={{ height }}>
      {!ready && <MiniWave color={progressColor} bars={62} className="wave-loading" />}
      <div ref={ref} style={{ opacity: ready ? 1 : 0, height }} />
    </div>
  );
}
export function GlobalAudioPlayer() {
  const { player, togglePlayback, seek, volume, setVolume, creations, playTrack } = useStudio();
  const mutedVolume = useRef(0.75);
  const effect = player.effectId ? getEffect(player.effectId) : null;
  const next = () => {
    if (creations.length) {
      const index = creations.findIndex((c) => c.id === player.id);
      const c = creations[(index + 1) % creations.length];
      playTrack({ id: c.id, title: c.name, url: c.url, effectId: c.effectId });
    } else seek(0);
  };
  return (
    <footer className="global-player">
      <div className="player-track">
        <div className={cn('player-art', player.playing && 'is-playing')}>
          <AudioLines size={22} />
        </div>
        <div>
          <span className="player-title">{player.title}</span>
          <span className="player-subtitle">
            {effect ? effect.name : 'Original voice'}
            <span> · </span>
            {player.id.startsWith('preview') ? 'Effect preview' : 'Session audio'}
          </span>
        </div>
        {player.playing && (
          <MiniWave bars={10} active color="#75d8e7" className="player-live-wave" />
        )}
      </div>
      <div className="player-center">
        <div className="transport">
          <Tip label="Back 10 seconds">
            <button
              className="icon-button"
              onClick={() => seek(player.time - 10)}
              aria-label="Back 10 seconds"
            >
              <SkipBack size={17} />
            </button>
          </Tip>
          <button
            className="player-play"
            onClick={togglePlayback}
            aria-label={player.playing ? 'Pause audio' : 'Play audio'}
          >
            {player.playing ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
          </button>
          <Tip label="Next creation">
            <button className="icon-button" onClick={next} aria-label="Next creation">
              <SkipForward size={17} />
            </button>
          </Tip>
        </div>
        <div className="player-timeline">
          <span>{formatTime(player.time)}</span>
          <Slider
            aria-label="Audio playback position"
            value={[player.time]}
            max={player.duration || 12.8}
            step={0.1}
            onValueChange={([time]) => seek(time)}
          />
          <span>{formatTime(player.duration)}</span>
        </div>
      </div>
      <div className="player-volume">
        <Tip label={volume === 0 ? 'Unmute' : 'Mute'}>
          <button
            className="icon-button"
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            onClick={() => {
              if (volume > 0) {
                mutedVolume.current = volume;
                setVolume(0);
              } else setVolume(mutedVolume.current);
            }}
          >
            {volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </Tip>
        <Slider
          aria-label="Playback volume"
          value={[volume]}
          max={1}
          step={0.01}
          onValueChange={([value]) => setVolume(value)}
        />
        <span className="player-quality">
          WAV<span>LOSSLESS</span>
        </span>
        <Headphones size={16} className="player-headphones" />
      </div>
    </footer>
  );
}

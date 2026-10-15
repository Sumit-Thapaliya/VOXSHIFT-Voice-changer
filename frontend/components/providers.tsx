'use client';
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { MotionConfig } from 'framer-motion';
import { TooltipProvider } from './ui';
import {
  defaultPreferences,
  initialCreations,
  initialHistory,
  getEffect,
  type AudioSource,
  type Creation,
  type HistoryEntry,
  type Preferences,
  type VoiceProfile,
} from '@/lib/data';
import { uid } from '@/lib/utils';
type Track = { id: string; title: string; url: string; effectId?: string; rate?: number };
type PlayerState = Track & { playing: boolean; time: number; duration: number };
type WorkspaceState = {
  creations: Creation[];
  history: HistoryEntry[];
  profiles: VoiceProfile[];
  favorites: string[];
  preferences: Preferences;
};
type StudioContextType = WorkspaceState & {
  selectedEffect: string;
  setSelectedEffect: (id: string) => void;
  intensity: number;
  setIntensity: (n: number) => void;
  reference: AudioSource | null;
  setReference: (audio: AudioSource | null) => void;
  source: AudioSource;
  setSource: (audio: AudioSource) => void;
  output: Creation | null;
  setOutput: (creation: Creation | null) => void;
  player: PlayerState;
  playTrack: (track: Track) => void;
  togglePlayback: () => void;
  seek: (time: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  getMedia: () => HTMLAudioElement | null;
  getAnalyser: () => AnalyserNode | null;
  previewEffect: (id: string) => void;
  addCreation: (creation: Creation) => void;
  updateCreation: (id: string, data: Partial<Creation>) => void;
  deleteCreation: (id: string) => void;
  addHistory: (entry: Omit<HistoryEntry, 'id' | 'time'>) => void;
  clearHistory: () => void;
  toggleFavorite: (id: string) => void;
  addProfile: (profile: VoiceProfile) => void;
  deleteProfile: (id: string) => void;
  savePreferences: (p: Preferences) => void;
  resetWorkspace: () => void;
  hydrated: boolean;
};
const StudioContext = createContext<StudioContextType | null>(null);
export function Providers({ children }: { children: React.ReactNode }) {
  const [selectedEffect, setSelectedEffect] = useState('robot');
  const [intensity, setIntensity] = useState(75);
  const [reference, setReference] = useState<AudioSource | null>(null);
  const [source, setSourceState] = useState<AudioSource>({
    url: '/audio/sample.wav',
    name: 'Welcome to VoxShift.wav',
    duration: 12.8,
  });
  const [output, setOutput] = useState<Creation | null>(null);
  const [creations, setCreations] = useState(initialCreations);
  const [history, setHistory] = useState(initialHistory);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [favorites, setFavorites] = useState(['robot', 'deep']);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const trackRef = useRef<Track>({
    id: 'source',
    title: 'Welcome to VoxShift',
    url: '/audio/sample.wav',
  });
  const [player, setPlayer] = useState<PlayerState>({
    ...trackRef.current,
    playing: false,
    time: 0,
    duration: 12.8,
  });
  const [volume, setVolumeState] = useState(0.75);
  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.motion = preferences.motion ? 'full' : 'reduced';
  }, [preferences.theme, preferences.motion]);
  useEffect(() => {
    const audio = new Audio('/audio/sample.wav');
    audio.preload = 'metadata';
    audio.volume = 0.75;
    audioRef.current = audio;
    const time = () => setPlayer((p) => ({ ...p, time: audio.currentTime }));
    const duration = () =>
      setPlayer((p) => ({
        ...p,
        duration: Number.isFinite(audio.duration) ? audio.duration : p.duration,
      }));
    const play = () => setPlayer((p) => ({ ...p, playing: true }));
    const pause = () => setPlayer((p) => ({ ...p, playing: false }));
    audio.addEventListener('timeupdate', time);
    audio.addEventListener('loadedmetadata', duration);
    audio.addEventListener('play', play);
    audio.addEventListener('pause', pause);
    audio.addEventListener('ended', pause);
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', time);
      audio.removeEventListener('loadedmetadata', duration);
      audio.removeEventListener('play', play);
      audio.removeEventListener('pause', pause);
      audio.removeEventListener('ended', pause);
      audioRef.current = null;
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    };
  }, []);
  const enableAudioGraph = useCallback(() => {
    if (!audioRef.current) return;
    try {
      if (!audioContextRef.current) {
        const context = new AudioContext();
        const media = context.createMediaElementSource(audioRef.current);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.83;
        media.connect(analyser).connect(context.destination);
        audioContextRef.current = context;
        analyserRef.current = analyser;
      }
      void audioContextRef.current.resume();
    } catch {}
  }, []);
  const playTrack = useCallback(
    (track: Track) => {
      const audio = audioRef.current;
      if (!audio) return;
      enableAudioGraph();
      if (trackRef.current.id === track.id && audio.src.endsWith(track.url)) {
        if (audio.paused) {
          audio
            .play()
            .catch(() => toast.error('Could not play this audio. Try loading another file.'));
        } else audio.pause();
        return;
      }
      audio.pause();
      audio.src = track.url;
      audio.playbackRate = track.rate || 1;
      audio.preservesPitch = false;
      trackRef.current = track;
      setPlayer({ ...track, playing: false, time: 0, duration: 0 });
      audio.play().catch(() => toast.error('Could not play this audio. Try again.'));
    },
    [enableAudioGraph],
  );
  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    enableAudioGraph();
    if (audio.paused) audio.play().catch(() => toast.error('Press play again to enable audio.'));
    else audio.pause();
  }, [enableAudioGraph]);
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration))
      audio.currentTime = Math.max(0, Math.min(time, audio.duration));
  }, []);
  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);
  const getMedia = useCallback(() => audioRef.current, []);
  const getAnalyser = useCallback(() => analyserRef.current, []);
  const setSource = useCallback((newSource: AudioSource) => {
    setSourceState(newSource);
    setOutput(null);
    setHistory((h) =>
      [
        {
          id: uid(),
          action: 'Audio added',
          type: 'upload' as const,
          detail: newSource.name,
          time: new Date().toISOString(),
          duration: newSource.duration,
          status: 'Ready',
          demo: newSource.url.startsWith('/audio/'),
        },
        ...h,
      ].slice(0, 100),
    );
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = newSource.url;
      audio.playbackRate = 1;
      trackRef.current = {
        id: 'source',
        title: newSource.name.replace(/\.[^.]+$/, ''),
        url: newSource.url,
      };
      setPlayer({ ...trackRef.current, playing: false, time: 0, duration: newSource.duration });
    }
  }, []);
  const selectEffect = useCallback(
    (id: string) => {
      if (id !== selectedEffect) {
        setSelectedEffect(id);
        setOutput(null);
      }
    },
    [selectedEffect],
  );
  const previewEffect = useCallback(
    (id: string) => {
      const effect = getEffect(id);
      const url = ['robot', 'deep', 'radio'].includes(id)
        ? `/audio/demo-${id}.wav`
        : '/audio/sample.wav';
      playTrack({
        id: `preview-${id}`,
        title: `${effect.name} preview`,
        url,
        effectId: id,
        rate: url.includes('demo-') ? 1 : effect.rate,
      });
    },
    [playTrack],
  );
  const addHistory = useCallback(
    (entry: Omit<HistoryEntry, 'id' | 'time'>) =>
      setHistory((h) =>
        [{ ...entry, id: uid(), time: new Date().toISOString() }, ...h].slice(0, 100),
      ),
    [],
  );
  const addCreation = useCallback(
    (creation: Creation) => setCreations((c) => [creation, ...c]),
    [],
  );
  const updateCreation = useCallback(
    (id: string, data: Partial<Creation>) =>
      setCreations((c) => c.map((item) => (item.id === id ? { ...item, ...data } : item))),
    [],
  );
  const deleteCreation = useCallback((id: string) => {
    setCreations((c) => c.filter((item) => item.id !== id));
    if (trackRef.current.id === id) audioRef.current?.pause();
  }, []);
  const toggleFavorite = useCallback(
    (id: string) => setFavorites((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id])),
    [],
  );
  const addProfile = useCallback(
    (profile: VoiceProfile) => setProfiles((p) => [profile, ...p]),
    [],
  );
  const deleteProfile = useCallback(
    (id: string) => setProfiles((p) => p.filter((x) => x.id !== id)),
    [],
  );
  const savePreferences = useCallback((p: Preferences) => {
    setPreferences(p);
    toast.success('Studio preferences saved');
  }, []);
  const clearHistory = useCallback(() => setHistory([]), []);
  const resetWorkspace = useCallback(() => {
    const urls = new Set([
      source.url,
      reference?.url,
      output?.url,
      ...creations.map((c) => c.url),
      ...profiles.map((p) => p.url),
    ]);
    audioRef.current?.pause();
    for (const url of urls) if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    const demo = { url: '/audio/sample.wav', name: 'Welcome to VoxShift.wav', duration: 12.8 };
    setSourceState(demo);
    setReference(null);
    setCreations([]);
    setHistory([]);
    setProfiles([]);
    setFavorites([]);
    setPreferences(defaultPreferences);
    setOutput(null);
    if (audioRef.current) {
      audioRef.current.src = demo.url;
      audioRef.current.playbackRate = 1;
      trackRef.current = { id: 'source', title: 'Welcome to VoxShift', url: demo.url };
      setPlayer({ ...trackRef.current, playing: false, time: 0, duration: 12.8 });
    }
    toast.success('Local workspace cleared');
  }, [source, reference, output, creations, profiles]);
  return (
    <StudioContext.Provider
      value={{
        selectedEffect,
        setSelectedEffect: selectEffect,
        intensity,
        setIntensity,
        reference,
        setReference,
        source,
        setSource,
        output,
        setOutput,
        creations,
        history,
        profiles,
        favorites,
        preferences,
        player,
        playTrack,
        togglePlayback,
        seek,
        volume,
        setVolume,
        getMedia,
        getAnalyser,
        previewEffect,
        addCreation,
        updateCreation,
        deleteCreation,
        addHistory,
        clearHistory,
        toggleFavorite,
        addProfile,
        deleteProfile,
        savePreferences,
        resetWorkspace,
        hydrated,
      }}
    >
      <MotionConfig reducedMotion={preferences.motion ? 'user' : 'always'}>
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
      </MotionConfig>
      <Toaster
        theme="dark"
        position="bottom-right"
        offset={{ bottom: 108, right: 32 }}
        mobileOffset={{ bottom: 92, top: 18, left: 18, right: 18 }}
        richColors
        closeButton
        toastOptions={{
          style: {
            background: '#151a28',
            border: '1px solid #2e374b',
            color: '#edf2fa',
          },
        }}
      />
    </StudioContext.Provider>
  );
}
export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error('useStudio must be used inside Providers');
  return context;
}

'use client';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { MotionConfig } from 'framer-motion';
import { TooltipProvider } from './ui';
import {
  defaultPreferences,
  initialCreations,
  initialHistory,
  DEMO_SOURCE,
  libraryVoices,
  findVoice,
  type AudioSource,
  type Creation,
  type CustomVoice,
  type HistoryEntry,
  type LibraryVoice,
  type Preferences,
} from '@/lib/data';
import { blendIntensity, decodeToAudioData, encodeWav, mergeChain, renderChain, type VoiceChain } from '@/lib/dsp';
import * as engine from '@/lib/engine';
import { uid, downloadFile } from '@/lib/utils';

type Track = { id: string; title: string; url: string; effectId?: string; rate?: number };
type PlayerState = Track & { playing: boolean; time: number; duration: number };

export type RenderOutcome = {
  url: string;
  blob: Blob;
  duration: number;
  engine: 'server' | 'browser';
  metrics?: { lufs?: number; peak_dbfs?: number; noise_floor_dbfs?: number };
  renderId?: string;
};

type StudioContextType = {
  /* voices */
  voices: LibraryVoice[];
  selectedEffect: string;
  setSelectedEffect: (id: string) => void;
  activeVoice: LibraryVoice;
  chain: VoiceChain;
  setChain: (chain: VoiceChain) => void;
  resetChain: () => void;
  intensity: number;
  setIntensity: (value: number) => void;
  customVoices: CustomVoice[];
  saveCustomVoice: (voice: Omit<CustomVoice, 'id' | 'createdAt'>, options?: { persist: boolean }) => Promise<CustomVoice>;
  deleteCustomVoice: (id: string) => Promise<void>;
  updateCustomVoice: (id: string, data: Partial<CustomVoice>) => void;
  /* audio */
  source: AudioSource;
  setSource: (audio: AudioSource) => void;
  output: Creation | null;
  setOutput: (creation: Creation | null) => void;
  /* engine */
  engineState: engine.EngineState;
  engineHealth: engine.EngineHealth | null;
  refreshEngine: () => Promise<engine.EngineHealth | null>;
  renderVoice: (
    options?: { audio?: AudioSource; chain?: VoiceChain; intensity?: number; name?: string; onProgress?: (value: number, stage: string) => void },
  ) => Promise<RenderOutcome>;
  polishAudio: (audio: AudioSource, onProgress?: (value: number, stage: string) => void) => Promise<RenderOutcome>;
  /* player */
  player: PlayerState;
  playTrack: (track: Track) => void;
  togglePlayback: () => void;
  seek: (time: number) => void;
  volume: number;
  setVolume: (value: number) => void;
  getAnalyser: () => AnalyserNode | null;
  previewVoice: (voiceId: string) => Promise<void>;
  /* workspace */
  creations: Creation[];
  history: HistoryEntry[];
  favorites: string[];
  preferences: Preferences;
  player_ready: boolean;
  addCreation: (creation: Creation) => void;
  updateCreation: (id: string, data: Partial<Creation>) => void;
  deleteCreation: (id: string) => void;
  addHistory: (entry: Omit<HistoryEntry, 'id' | 'time'>) => void;
  clearHistory: () => void;
  toggleFavorite: (id: string) => void;
  savePreferences: (preferences: Preferences, options?: { silent?: boolean }) => void;
  resetWorkspace: () => void;
  hydrated: boolean;
  saveProject: (name: string, notes?: string) => Promise<void>;
};

const StudioContext = createContext<StudioContextType | null>(null);

const PERSIST_KEY = 'voxshift.workspace.v1';

type PersistedWorkspace = {
  preferences: Preferences;
  customVoices: CustomVoice[];
  favorites: string[];
  selectedEffect: string;
  intensity: number;
  chain: VoiceChain;
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [selectedEffect, setSelectedEffectState] = useState('robot');
  const [chain, setChainState] = useState<VoiceChain>(() => findVoice(libraryVoices(), 'robot').chain);
  const [intensity, setIntensity] = useState(75);
  const [source, setSourceState] = useState<AudioSource>(DEMO_SOURCE);
  const [output, setOutput] = useState<Creation | null>(null);
  const [creations, setCreations] = useState<Creation[]>(initialCreations);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [favorites, setFavorites] = useState<string[]>(['robot', 'deep']);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const [engineState, setEngineState] = useState<engine.EngineState>('checking');
  const [engineHealth, setEngineHealth] = useState<engine.EngineHealth | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const previewCache = useRef<Map<string, Blob>>(new Map());
  const trackRef = useRef<Track>({ id: 'source', title: 'Welcome to VoxShift', url: DEMO_SOURCE.url });
  const [player, setPlayer] = useState<PlayerState>({ ...trackRef.current, playing: false, time: 0, duration: 12.8 });
  const [volume, setVolumeState] = useState(0.75);

  const voices = useMemo(() => libraryVoices(customVoices), [customVoices]);
  const activeVoice = useMemo(() => findVoice(voices, selectedEffect), [voices, selectedEffect]);

  /* ------------------------------------------------------------ hydration */
  useEffect(() => {
    engine.loadEngineOverrides();
    try {
      const raw = window.localStorage.getItem(PERSIST_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedWorkspace>;
        if (saved.preferences) {
          setPreferences({ ...defaultPreferences, ...saved.preferences });
          if (saved.preferences.engineUrl || saved.preferences.engineApiKey) {
            engine.saveEngineOverrides({ baseUrl: saved.preferences.engineUrl, apiKey: saved.preferences.engineApiKey });
          }
        }
        if (saved.customVoices?.length) setCustomVoices(saved.customVoices.map((voice) => ({ ...voice, chain: mergeChain(voice.chain) })));
        if (saved.favorites?.length) setFavorites(saved.favorites);
        if (saved.selectedEffect) setSelectedEffectState(saved.selectedEffect);
        if (saved.intensity) setIntensity(saved.intensity);
        if (saved.chain) setChainState(mergeChain(saved.chain));
      }
    } catch {
      /* corrupted storage: start fresh */
    }
    setHydrated(true);
  }, []);

  /* ------------------------------------------------------ persistence sync */
  useEffect(() => {
    if (!hydrated) return;
    if (!preferences.remember) {
      try {
        window.localStorage.removeItem(PERSIST_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const payload: PersistedWorkspace = { preferences, customVoices, favorites, selectedEffect, intensity, chain };
    try {
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
    } catch {
      /* storage full or disabled */
    }
  }, [hydrated, preferences, customVoices, favorites, selectedEffect, intensity, chain]);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.motion = preferences.motion ? 'full' : 'reduced';
  }, [preferences.theme, preferences.motion]);

  /* ------------------------------------------------------------- the audio */
  useEffect(() => {
    const audio = new Audio(DEMO_SOURCE.url);
    audio.preload = 'metadata';
    audio.volume = 0.75;
    audioRef.current = audio;
    const time = () => setPlayer((current) => ({ ...current, time: audio.currentTime }));
    const duration = () =>
      setPlayer((current) => ({ ...current, duration: Number.isFinite(audio.duration) ? audio.duration : current.duration }));
    const play = () => setPlayer((current) => ({ ...current, playing: true }));
    const pause = () => setPlayer((current) => ({ ...current, playing: false }));
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
    } catch {
      /* audio graph unavailable: playback still works through the element */
    }
  }, []);

  const playTrack = useCallback(
    (track: Track) => {
      const audio = audioRef.current;
      if (!audio) return;
      enableAudioGraph();
      if (trackRef.current.id === track.id && audio.src.endsWith(track.url)) {
        if (audio.paused) audio.play().catch(() => toast.error('Could not play this audio. Try loading another file.'));
        else audio.pause();
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
    if (audio && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(time, audio.duration));
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);

  const getAnalyser = useCallback(() => analyserRef.current, []);

  /* ---------------------------------------------------------------- engine */
  const refreshEngine = useCallback(async () => {
    setEngineState((current) => (current === 'online' ? current : 'checking'));
    try {
      const health = await engine.getHealth();
      setEngineHealth(health);
      setEngineState(health.status === 'online' ? 'online' : 'offline');
      return health;
    } catch {
      setEngineHealth(null);
      setEngineState('offline');
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshEngine();
    const timer = setInterval(() => void refreshEngine(), 20000);
    return () => clearInterval(timer);
  }, [refreshEngine]);

  /* --------------------------------------------------------------- helpers */
  const masterFromPreferences = useCallback(
    (overrides?: VoiceChain['master']): VoiceChain['master'] => ({
      highpassHz: 60,
      lowpassHz: 0,
      denoise: preferences.denoise ? 55 : 0,
      outputGainDb: 0,
      normalize: preferences.normalize,
      targetLufs: Number(preferences.targetLufs) || -16,
      limiterCeilingDb: -1,
      trimSilence: preferences.trimSilence,
      fadeMs: 8,
      ...overrides,
    }),
    [preferences.denoise, preferences.normalize, preferences.targetLufs, preferences.trimSilence],
  );

  /** One conversion path for the whole app: server first, browser fallback. */
  const renderVoice = useCallback<StudioContextType['renderVoice']>(
    async (options = {}) => {
      const audio = options.audio || source;
      const design = mergeChain(options.chain || chain);
      const amount = options.intensity ?? intensity;
      const blended = blendIntensity(design, amount);
      const finalChain: VoiceChain = { ...blended, master: masterFromPreferences(design.master) };
      const label = options.name || activeVoice.name;
      const useServer = preferences.preferServer && engineState === 'online';
      options.onProgress?.(4, useServer ? 'Uploading to the engine' : 'Reading audio in your browser');

      if (useServer) {
        try {
          const blob = audio.blob || (await (await fetch(audio.url)).blob());
          const file = new File([blob], audio.name || 'source.wav', { type: blob.type || 'audio/wav' });
          const job = await engine.startJob(file, file.name, { chain: finalChain, intensity: 100, name: label });
          const finished = await engine.waitForJob(job.job_id, (update) =>
            options.onProgress?.(Math.max(4, update.progress || 4), update.stage || 'Rendering'),
          );
          const rendered = await engine.fetchJobAudio(finished.job_id);
          const url = URL.createObjectURL(rendered);
          return {
            url,
            blob: rendered,
            duration: finished.metrics?.duration ?? audio.duration,
            engine: 'server',
            metrics: finished.metrics
              ? { lufs: finished.metrics.lufs, peak_dbfs: finished.metrics.peak_dbfs, noise_floor_dbfs: finished.metrics.noise_floor_dbfs }
              : undefined,
            renderId: finished.job_id,
          };
        } catch (error) {
          toast.warning('The engine could not finish this render. Falling back to local processing.', {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      }

      const decoded = await decodeToAudioData(audio.url);
      const rendered = renderChain(decoded, finalChain, (progress) => options.onProgress?.(progress.value, progress.stage));
      const blob = encodeWav(rendered, preferences.quality === 'High' ? 24 : 16);
      return {
        url: URL.createObjectURL(blob),
        blob,
        duration: rendered.channels[0].length / rendered.sampleRate,
        engine: 'browser',
      };
    },
    [source, chain, intensity, activeVoice.name, preferences.preferServer, preferences.quality, engineState, masterFromPreferences],
  );

  const polishAudio = useCallback<StudioContextType['polishAudio']>(
    async (audio, onProgress) => {
      const options = {
        denoise: 70,
        deess: 35,
        gate: 30,
        comp: 35,
        highpassHz: 70,
        targetLufs: Number(preferences.targetLufs) || -16,
        trimSilence: true,
        fadeMs: 12,
      };
      if (preferences.preferServer && engineState === 'online') {
        try {
          const blob = audio.blob || (await (await fetch(audio.url)).blob());
          const file = new File([blob], audio.name || 'source.wav', { type: blob.type || 'audio/wav' });
          const job = await engine.startJob(file, file.name, { kind: 'polish', polish: options });
          const finished = await engine.waitForJob(job.job_id, (update) =>
            onProgress?.(Math.max(4, update.progress || 4), update.stage || 'Polishing'),
          );
          const rendered = await engine.fetchJobAudio(finished.job_id);
          return {
            url: URL.createObjectURL(rendered),
            blob: rendered,
            duration: finished.metrics?.duration ?? audio.duration,
            engine: 'server',
            metrics: finished.metrics
              ? { lufs: finished.metrics.lufs, peak_dbfs: finished.metrics.peak_dbfs, noise_floor_dbfs: finished.metrics.noise_floor_dbfs }
              : undefined,
            renderId: finished.job_id,
          };
        } catch (error) {
          toast.warning('Engine polish unavailable. Cleaning up locally instead.', {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      }
      onProgress?.(20, 'Cleaning up in your browser');
      const decoded = await decodeToAudioData(audio.url);
      const rendered = renderChain(
        decoded,
        {
          ...mergeChain(),
          deess: options.deess,
          gate: options.gate,
          comp: options.comp,
          master: {
            highpassHz: options.highpassHz,
            denoise: options.denoise,
            trimSilence: true,
            fadeMs: options.fadeMs,
            normalize: true,
            targetLufs: options.targetLufs,
            limiterCeilingDb: -1,
          },
        },
        (progress) => onProgress?.(progress.value, progress.stage),
      );
      const blob = encodeWav(rendered, 16);
      return { url: URL.createObjectURL(blob), blob, duration: rendered.channels[0].length / rendered.sampleRate, engine: 'browser' };
    },
    [preferences.preferServer, preferences.targetLufs, engineState],
  );

  /* ----------------------------------------------------------------- voices */
  const setSelectedEffect = useCallback(
    (id: string) => {
      const voice = findVoice(voices, id);
      setSelectedEffectState(id);
      setChainState(mergeChain(voice.chain));
      setOutput(null);
    },
    [voices],
  );

  const setChain = useCallback((next: VoiceChain) => {
    setChainState(mergeChain(next));
    setOutput(null);
  }, []);

  const resetChain = useCallback(() => setChainState(mergeChain()), []);

  const saveCustomVoice = useCallback<StudioContextType['saveCustomVoice']>(
    async (voice, options) => {
      const local: CustomVoice = {
        ...voice,
        chain: mergeChain(voice.chain),
        id: uid(),
        createdAt: new Date().toISOString(),
      };
      if (options?.persist && engineState === 'online') {
        try {
          const saved = await engine.saveVoice({
            name: voice.name,
            description: voice.description,
            color: voice.color,
            tags: voice.tags,
            chain: local.chain,
            archetypeId: voice.archetypeId,
          });
          local.serverId = saved.id;
          local.createdAt = saved.created_at;
        } catch (error) {
          toast.warning('Saved to this browser only: the engine rejected the voice.', {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      }
      setCustomVoices((current) => [local, ...current]);
      addHistoryRef.current({
        action: 'Voice designed',
        type: 'voice',
        detail: local.name,
        status: options?.persist && local.serverId ? 'Saved to engine' : 'Saved to this browser',
      });
      return local;
    },
    [engineState],
  );

  const deleteCustomVoice = useCallback(
    async (id: string) => {
      const voice = customVoices.find((item) => item.id === id);
      setCustomVoices((current) => current.filter((item) => item.id !== id));
      if (voice?.serverId && engineState === 'online') {
        try {
          await engine.deleteVoice(voice.serverId);
        } catch {
          toast.info('Removed locally. The engine copy could not be deleted.');
        }
      }
    },
    [customVoices, engineState],
  );

  const updateCustomVoice = useCallback((id: string, data: Partial<CustomVoice>) => {
    setCustomVoices((current) => current.map((voice) => (voice.id === id ? { ...voice, ...data, chain: data.chain ? mergeChain(data.chain) : voice.chain } : voice)));
  }, []);

  /* --------------------------------------------------------------- previews */
  const previewVoice = useCallback<StudioContextType['previewVoice']>(
    async (voiceId) => {
      const voice = findVoice(voices, voiceId);
      const cached = previewCache.current.get(voiceId);
      if (cached) {
        playTrack({ id: `preview-${voiceId}`, title: `${voice.name} preview`, url: URL.createObjectURL(cached), effectId: voiceId });
        return;
      }
      const toastId = toast.loading(`Rendering the ${voice.name} preview…`, {
        description: engineState === 'online' ? 'Using the CPU engine' : 'Using your browser',
      });
      try {
        const demo = DEMO_SOURCE;
        let outcome: RenderOutcome;
        if (preferences.preferServer && engineState === 'online') {
          try {
            const blob = await (await fetch(demo.url)).blob();
            const file = new File([blob], 'voxshift-demo.wav', { type: 'audio/wav' });
            const job = await engine.startJob(file, file.name, { chain: { ...voice.chain, master: masterFromPreferences() }, intensity: 100, name: voice.name });
            const finished = await engine.waitForJob(job.job_id);
            const rendered = await engine.fetchJobAudio(finished.job_id);
            outcome = { url: URL.createObjectURL(rendered), blob: rendered, duration: demo.duration, engine: 'server', renderId: finished.job_id };
          } catch {
            outcome = await renderVoice({ audio: demo, chain: voice.chain, intensity: 100, name: voice.name });
          }
        } else {
          outcome = await renderVoice({ audio: demo, chain: voice.chain, intensity: 100, name: voice.name });
        }
        previewCache.current.set(voiceId, outcome.blob);
        playTrack({ id: `preview-${voiceId}`, title: `${voice.name} preview`, url: outcome.url, effectId: voiceId });
        toast.success(`${voice.name} preview ready`, { id: toastId, description: outcome.engine === 'server' ? 'Rendered by the engine' : 'Rendered in your browser' });
      } catch (error) {
        toast.error('Could not render this preview', {
          id: toastId,
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [voices, playTrack, engineState, preferences.preferServer, renderVoice, masterFromPreferences],
  );

  /* -------------------------------------------------------------- workspace */
  const setSource = useCallback(
    (newSource: AudioSource) => {
      setSourceState(newSource);
      setOutput(null);
      setHistory((current) =>
        [
          {
            id: uid(),
            action: 'Audio added',
            type: 'upload' as const,
            detail: newSource.name,
            time: new Date().toISOString(),
            duration: newSource.duration,
            status: 'Ready',
          },
          ...current,
        ].slice(0, 120),
      );
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = newSource.url;
        audio.playbackRate = 1;
        trackRef.current = { id: 'source', title: newSource.name.replace(/\.[^.]+$/, ''), url: newSource.url };
        setPlayer({ ...trackRef.current, playing: false, time: 0, duration: newSource.duration });
      }
    },
    [],
  );

  const addHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'time'>) => {
    setHistory((current) => [{ ...entry, id: uid(), time: new Date().toISOString() }, ...current].slice(0, 120));
  }, []);
  const addHistoryRef = useRef(addHistory);
  addHistoryRef.current = addHistory;

  const addCreation = useCallback((creation: Creation) => setCreations((current) => [creation, ...current]), []);
  const updateCreation = useCallback(
    (id: string, data: Partial<Creation>) =>
      setCreations((current) => current.map((item) => (item.id === id ? { ...item, ...data } : item))),
    [],
  );
  const deleteCreation = useCallback((id: string) => {
    setCreations((current) => current.filter((item) => item.id !== id));
    if (trackRef.current.id === id) audioRef.current?.pause();
  }, []);
  const toggleFavorite = useCallback(
    (id: string) => setFavorites((value) => (value.includes(id) ? value.filter((item) => item !== id) : [...value, id])),
    [],
  );
  const clearHistory = useCallback(() => setHistory([]), []);

  const savePreferences = useCallback((next: Preferences, options?: { silent?: boolean }) => {
    setPreferences(next);
    engine.saveEngineOverrides({ baseUrl: next.engineUrl, apiKey: next.engineApiKey });
    if (!options?.silent) toast.success('Studio preferences saved');
  }, []);

  const saveProject = useCallback(
    async (name: string, notes?: string) => {
      if (engineState !== 'online') {
        toast.error('Projects need the engine. Start it and try again.');
        return;
      }
      try {
        await engine.saveProject({
          name,
          sourceName: source.name,
          sourceSeconds: source.duration,
          chain: { ...chain, master: masterFromPreferences() },
          intensity,
          presetId: activeVoice.source === 'builtin' ? activeVoice.key : undefined,
          notes,
        });
        addHistory({ action: 'Project saved', type: 'settings', detail: name, status: 'On engine' });
        toast.success('Project saved on the engine');
      } catch (error) {
        toast.error('Could not save the project', { description: error instanceof Error ? error.message : undefined });
      }
    },
    [engineState, source, chain, intensity, activeVoice, masterFromPreferences, addHistory],
  );

  const resetWorkspace = useCallback(() => {
    const urls = [source.url, output?.url, ...creations.map((item) => item.url)];
    audioRef.current?.pause();
    for (const url of urls) if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    previewCache.current.clear();
    setSourceState(DEMO_SOURCE);
    setCreations([]);
    setHistory([]);
    setCustomVoices([]);
    setFavorites([]);
    setPreferences(defaultPreferences);
    setOutput(null);
    setSelectedEffectState('robot');
    setChainState(findVoice(libraryVoices(), 'robot').chain);
    if (audioRef.current) {
      audioRef.current.src = DEMO_SOURCE.url;
      audioRef.current.playbackRate = 1;
      trackRef.current = { id: 'source', title: 'Welcome to VoxShift', url: DEMO_SOURCE.url };
      setPlayer({ ...trackRef.current, playing: false, time: 0, duration: 12.8 });
    }
    toast.success('Workspace cleared');
  }, [source, output, creations, customVoices]);

  const value: StudioContextType = {
    voices,
    selectedEffect,
    setSelectedEffect,
    activeVoice,
    chain,
    setChain,
    resetChain,
    intensity,
    setIntensity,
    customVoices,
    saveCustomVoice,
    deleteCustomVoice,
    updateCustomVoice,
    source,
    setSource,
    output,
    setOutput,
    engineState,
    engineHealth,
    refreshEngine,
    renderVoice,
    polishAudio,
    player,
    playTrack,
    togglePlayback,
    seek,
    volume,
    setVolume,
    getAnalyser,
    previewVoice,
    creations,
    history,
    favorites,
    preferences,
    player_ready: hydrated,
    addCreation,
    updateCreation,
    deleteCreation,
    addHistory,
    clearHistory,
    toggleFavorite,
    savePreferences,
    resetWorkspace,
    hydrated,
    saveProject,
  };

  return (
    <StudioContext.Provider value={value}>
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
        toastOptions={{ style: { background: '#151a28', border: '1px solid #2e374b', color: '#edf2fa' } }}
      />
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error('useStudio must be used inside Providers');
  return context;
}

export function useDownload() {
  const { addHistory, preferences } = useStudio();
  return useCallback(
    (url: string, filename: string, duration?: number) => {
      downloadFile(url, filename);
      addHistory({ action: 'Audio exported', type: 'export', detail: filename, status: 'Downloaded', duration });
      if (!preferences.notifications) return;
    },
    [addHistory, preferences.notifications],
  );
}

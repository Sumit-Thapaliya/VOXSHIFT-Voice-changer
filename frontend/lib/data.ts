import presets from './voice-presets.json';
import { mergeChain, type VoiceChain } from './dsp';

export type EffectCategory = 'Human' | 'Fun' | 'Robotic' | 'Cinematic' | 'Professional' | 'Forged' | 'Custom';

export type EffectMeta = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: EffectCategory;
  color: string;
  badge?: string;
};

export type ArchetypeMeta = {
  id: string;
  label: string;
  description: string;
  color: string;
  tags: string[];
  chain: VoiceChain;
};

export type CustomVoice = {
  id: string;
  name: string;
  description?: string;
  color: string;
  tags: string[];
  chain: VoiceChain;
  archetypeId?: string;
  createdAt: string;
  serverId?: string;
  renderCount?: number;
};

/** Anything the Studio can transform a voice with. */
export type LibraryVoice = {
  id: string;
  key: string;
  name: string;
  shortName: string;
  description: string;
  category: EffectCategory;
  color: string;
  badge?: string;
  chain: VoiceChain;
  source: 'builtin' | 'archetype' | 'custom';
  serverId?: string;
  tags?: string[];
  createdAt?: string;
};

const chainById = new Map<string, VoiceChain>(
  (presets.effects as { id: string; chain: Partial<VoiceChain> }[]).map((entry) => [entry.id, mergeChain(entry.chain)]),
);

export const effects: EffectMeta[] = [
  {
    id: 'baby',
    name: 'Baby Voice',
    shortName: 'Baby',
    description: 'Small voice. Big personality. A light, playful pitch with a little extra charm.',
    category: 'Fun',
    color: '#ef9ccf',
  },
  {
    id: 'female',
    name: 'Female Voice',
    shortName: 'Female',
    description: 'A brighter, lighter vocal register with a soft, expressive character.',
    category: 'Human',
    color: '#e98ee4',
    badge: 'POPULAR',
  },
  {
    id: 'male',
    name: 'Male Voice',
    shortName: 'Male',
    description: 'A grounded, resonant register. Confident, balanced, and effortlessly clear.',
    category: 'Human',
    color: '#7baeff',
  },
  {
    id: 'robot',
    name: 'Robot Voice',
    shortName: 'Robot',
    description: 'A little human. A little machine. Metallic modulation for your next transmission.',
    category: 'Robotic',
    color: '#71d8eb',
    badge: 'TRENDING',
  },
  {
    id: 'metallic',
    name: 'Metallic',
    shortName: 'Metallic',
    description: 'Chrome-plated resonance with an electric edge. Built for a futuristic sound.',
    category: 'Robotic',
    color: '#a9b5ce',
  },
  {
    id: 'deep',
    name: 'Deep Voice',
    shortName: 'Deep voice',
    description: 'Rich, cinematic lows. Turn an ordinary sentence into an extraordinary entrance.',
    category: 'Cinematic',
    color: '#7b96f4',
    badge: 'POPULAR',
  },
  {
    id: 'monster',
    name: 'Monster',
    shortName: 'Monster',
    description: 'A deep, growling presence with just the right amount of beautiful distortion.',
    category: 'Cinematic',
    color: '#8bde9c',
  },
  {
    id: 'alien',
    name: 'Alien',
    shortName: 'Alien',
    description: 'Not from around here. An otherworldly shimmer with dual-phase modulation.',
    category: 'Fun',
    color: '#7fea9f',
    badge: 'NEW',
  },
  {
    id: 'chipmunk',
    name: 'Chipmunk',
    shortName: 'Chipmunk',
    description: 'Turn the energy all the way up. A fast, bright, delightfully tiny voice.',
    category: 'Fun',
    color: '#edb88e',
  },
  {
    id: 'radio',
    name: 'Radio Voice',
    shortName: 'Radio',
    description: 'On air, anywhere. A warm, band-limited broadcast sound with a nostalgic texture.',
    category: 'Professional',
    color: '#f48ca2',
  },
  {
    id: 'echo',
    name: 'Echo Voice',
    shortName: 'Echo',
    description: 'Give your words room to wander. Spacious, atmospheric repeats and rich depth.',
    category: 'Cinematic',
    color: '#a891f6',
  },
  {
    id: 'demon',
    name: 'Demon Voice',
    shortName: 'Demon',
    description: 'A darker dimension. Subterranean pitch, spectral texture, and a sinister edge.',
    category: 'Cinematic',
    color: '#ee7b7b',
  },
  {
    id: 'narrator',
    name: 'The Narrator',
    shortName: 'Narrator',
    description: 'Every story deserves a great voice. A warm, steady, storytelling register.',
    category: 'Professional',
    color: '#f2ca83',
    badge: 'NEW',
  },
  {
    id: 'cyber',
    name: 'Cyberpunk',
    shortName: 'Cyberpunk',
    description: 'Straight from the neon underground. A gritty, mechanical transmission.',
    category: 'Robotic',
    color: '#c28aff',
    badge: 'NEW',
  },
  {
    id: 'helium',
    name: 'Helium',
    shortName: 'Helium',
    description: 'A little lift, a lot of laughs. Light-hearted high frequencies that float.',
    category: 'Fun',
    color: '#79dfe1',
  },
  {
    id: 'whisper',
    name: 'Soft Spoken',
    shortName: 'Soft spoken',
    description: 'Dial down the intensity. A gentle, intimate tone for close-up moments.',
    category: 'Human',
    color: '#bbafeb',
  },
];

export const effectChains: Record<string, VoiceChain> = Object.fromEntries(chainById);

export const archetypes: ArchetypeMeta[] = (presets.archetypes as Omit<ArchetypeMeta, 'chain'>[]).map((entry) => ({
  ...entry,
  chain: mergeChain((presets.archetypes as unknown as { id: string; chain: Partial<VoiceChain> }[]).find((item) => item.id === entry.id)?.chain),
}));

export const presetDefaults = presets.defaults as unknown as Record<string, number>;
export const presetRanges = presets.ranges as unknown as Record<string, [number, number]>;
export const masterDefaults = presets.master_defaults as unknown as Record<string, number>;
export const SPEC_VERSION = presets.spec_version as string;

export const FORGE_PREFIX = 'forge:';
export const CUSTOM_PREFIX = 'custom:';

export function builtinVoices(): LibraryVoice[] {
  return effects.map((effect) => ({
    id: effect.id,
    key: effect.id,
    name: effect.name,
    shortName: effect.shortName,
    description: effect.description,
    category: effect.category,
    color: effect.color,
    badge: effect.badge,
    chain: effectChains[effect.id] || mergeChain(),
    source: 'builtin',
  }));
}

export function archetypeVoices(): LibraryVoice[] {
  return archetypes.map((archetype) => ({
    id: `${FORGE_PREFIX}${archetype.id}`,
    key: archetype.id,
    name: archetype.label,
    shortName: archetype.label.split(' ')[0],
    description: archetype.description,
    category: 'Forged',
    color: archetype.color,
    chain: archetype.chain,
    source: 'archetype',
    tags: archetype.tags,
  }));
}

export function customVoicesToLibrary(voices: CustomVoice[]): LibraryVoice[] {
  return voices.map((voice) => ({
    id: `${CUSTOM_PREFIX}${voice.id}`,
    key: voice.id,
    name: voice.name,
    shortName: voice.name.split(' ')[0],
    description: voice.description || 'A voice designed in the Forge from scratch.',
    category: 'Custom',
    color: voice.color,
    chain: voice.chain,
    source: 'custom',
    serverId: voice.serverId,
    tags: voice.tags,
    createdAt: voice.createdAt,
  }));
}

/** Every voice available in the workspace, built-in and made. */
export function libraryVoices(custom: CustomVoice[] = []): LibraryVoice[] {
  return [...builtinVoices(), ...archetypeVoices(), ...customVoicesToLibrary(custom)];
}

export function findVoice(voices: LibraryVoice[], id: string): LibraryVoice {
  return voices.find((voice) => voice.id === id) || voices[0];
}

/** Kept for the player and glyphs: resolves any id to display metadata. */
export function getEffect(id: string) {
  const builtin = effects.find((effect) => effect.id === id);
  if (builtin) {
    return { ...builtin, chain: effectChains[id] || mergeChain(), source: 'builtin' as const, key: id };
  }
  const archetypeId = id.startsWith(FORGE_PREFIX) ? id.slice(FORGE_PREFIX.length) : null;
  const archetype = archetypeId ? archetypes.find((item) => item.id === archetypeId) : null;
  if (archetype) {
    return {
      id,
      key: archetype.id,
      name: archetype.label,
      shortName: archetype.label,
      description: archetype.description,
      category: 'Forged' as EffectCategory,
      color: archetype.color,
      chain: archetype.chain,
      source: 'archetype' as const,
    };
  }
  return {
    id,
    key: id,
    name: 'Custom voice',
    shortName: 'Custom',
    description: 'A voice designed in the Forge.',
    category: 'Custom' as EffectCategory,
    color: '#b597ee',
    chain: mergeChain(),
    source: 'custom' as const,
  };
}

export type AudioSource = { url: string; name: string; duration: number; blob?: Blob };

export type Creation = {
  id: string;
  name: string;
  effectId: string;
  url: string;
  duration: number;
  createdAt: string;
  favorite: boolean;
  demo?: boolean;
  blob?: Blob;
  renderId?: string;
  voiceName?: string;
  chain?: VoiceChain;
  engine?: 'server' | 'browser';
  metrics?: { lufs?: number; peak_dbfs?: number; noise_floor_dbfs?: number };
};

export type HistoryEntry = {
  id: string;
  action: string;
  type: 'conversion' | 'upload' | 'export' | 'voice' | 'settings' | 'polish' | 'analysis';
  detail: string;
  time: string;
  duration?: number;
  status: string;
  creationId?: string;
  demo?: boolean;
};

export const initialCreations: Creation[] = [
  {
    id: 'demo-robot',
    name: 'Transmission 001',
    effectId: 'robot',
    url: '/audio/demo-robot.wav',
    duration: 13.4,
    createdAt: '2026-10-14T07:20:00Z',
    favorite: true,
    demo: true,
  },
  {
    id: 'demo-deep',
    name: 'A story worth telling',
    effectId: 'deep',
    url: '/audio/demo-deep.wav',
    duration: 17.2,
    createdAt: '2026-10-13T11:30:00Z',
    favorite: false,
    demo: true,
  },
  {
    id: 'demo-radio',
    name: 'Midnight on the air',
    effectId: 'radio',
    url: '/audio/demo-radio.wav',
    duration: 13.3,
    createdAt: '2026-10-12T08:00:00Z',
    favorite: true,
    demo: true,
  },
];

export const initialHistory: HistoryEntry[] = [
  {
    id: 'history-demo-1',
    action: 'Voice transformed',
    type: 'conversion',
    detail: 'Transmission 001 · Robot Voice',
    time: '2026-10-14T07:20:00Z',
    duration: 13.4,
    status: 'Completed',
    creationId: 'demo-robot',
    demo: true,
  },
  {
    id: 'history-demo-2',
    action: 'Voice transformed',
    type: 'conversion',
    detail: 'A story worth telling · Deep Voice',
    time: '2026-10-13T11:30:00Z',
    duration: 17.2,
    status: 'Completed',
    creationId: 'demo-deep',
    demo: true,
  },
  {
    id: 'history-demo-3',
    action: 'Voice transformed',
    type: 'conversion',
    detail: 'Midnight on the air · Radio Voice',
    time: '2026-10-12T08:00:00Z',
    duration: 13.3,
    status: 'Completed',
    creationId: 'demo-radio',
    demo: true,
  },
];

export type Preferences = {
  displayName: string;
  email: string;
  sampleRate: string;
  autoSave: boolean;
  notifications: boolean;
  motion: boolean;
  theme: 'midnight' | 'deep-space' | 'oled';
  quality: string;
  normalize: boolean;
  targetLufs: string;
  denoise: boolean;
  trimSilence: boolean;
  remember: boolean;
  engineUrl: string;
  engineApiKey: string;
  preferServer: boolean;
};

export const defaultPreferences: Preferences = {
  displayName: 'Alex Morgan',
  email: 'alex@voxshift.local',
  sampleRate: '44100',
  autoSave: true,
  notifications: true,
  motion: true,
  theme: 'midnight',
  quality: 'High',
  normalize: true,
  targetLufs: '-16',
  denoise: false,
  trimSilence: false,
  remember: true,
  engineUrl: '',
  engineApiKey: '',
  preferServer: true,
};

export const DEMO_SOURCE: AudioSource = {
  url: '/audio/sample.wav',
  name: 'Welcome to VoxShift.wav',
  duration: 12.8,
};

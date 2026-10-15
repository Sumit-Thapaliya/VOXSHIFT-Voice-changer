export type EffectCategory = 'Human' | 'Fun' | 'Robotic' | 'Cinematic' | 'Professional';
export type VoiceEffect = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: EffectCategory;
  color: string;
  rate: number;
  filter?: 'robot' | 'metal' | 'radio' | 'echo' | 'monster' | 'alien';
  badge?: string;
};
export const effects: VoiceEffect[] = [
  {
    id: 'baby',
    name: 'Baby Voice',
    shortName: 'Baby',
    description: 'Small voice. Big personality. A light, playful pitch with a little extra charm.',
    category: 'Fun',
    color: '#ef9ccf',
    rate: 1.55,
  },
  {
    id: 'female',
    name: 'Female Voice',
    shortName: 'Female',
    description: 'A brighter, lighter vocal register with a soft, expressive character.',
    category: 'Human',
    color: '#e98ee4',
    rate: 1.2,
    badge: 'POPULAR',
  },
  {
    id: 'male',
    name: 'Male Voice',
    shortName: 'Male',
    description: 'A grounded, resonant pitch. Confident, balanced, and effortlessly clear.',
    category: 'Human',
    color: '#7baeff',
    rate: 0.86,
  },
  {
    id: 'robot',
    name: 'Robot Voice',
    shortName: 'Robot',
    description:
      'A little human. A little machine. Metallic modulation for your next transmission.',
    category: 'Robotic',
    color: '#71d8eb',
    rate: 0.95,
    filter: 'robot',
    badge: 'TRENDING',
  },
  {
    id: 'metallic',
    name: 'Metallic',
    shortName: 'Metallic',
    description: 'Chrome-plated resonance with an electric edge. Built for a futuristic sound.',
    category: 'Robotic',
    color: '#a9b5ce',
    rate: 0.93,
    filter: 'metal',
  },
  {
    id: 'deep',
    name: 'Deep Voice',
    shortName: 'Deep voice',
    description: 'Rich, cinematic lows. Turn an ordinary sentence into an extraordinary entrance.',
    category: 'Cinematic',
    color: '#7b96f4',
    rate: 0.74,
    badge: 'POPULAR',
  },
  {
    id: 'monster',
    name: 'Monster',
    shortName: 'Monster',
    description: 'A deep, growling presence with just the right amount of beautiful distortion.',
    category: 'Cinematic',
    color: '#8bde9c',
    rate: 0.62,
    filter: 'monster',
  },
  {
    id: 'alien',
    name: 'Alien',
    shortName: 'Alien',
    description: 'Not from around here. An otherworldly shimmer with dual-phase modulation.',
    category: 'Fun',
    color: '#7fea9f',
    rate: 1.1,
    filter: 'alien',
    badge: 'NEW',
  },
  {
    id: 'chipmunk',
    name: 'Chipmunk',
    shortName: 'Chipmunk',
    description: 'Turn the energy all the way up. A fast, bright, delightfully tiny voice.',
    category: 'Fun',
    color: '#edb88e',
    rate: 1.8,
  },
  {
    id: 'radio',
    name: 'Radio Voice',
    shortName: 'Radio',
    description: 'On air, anywhere. A warm, vintage broadcast sound with a nostalgic texture.',
    category: 'Professional',
    color: '#f48ca2',
    rate: 0.96,
    filter: 'radio',
  },
  {
    id: 'echo',
    name: 'Echo Voice',
    shortName: 'Echo',
    description: 'Give your words room to wander. Spacious, atmospheric repeats and rich depth.',
    category: 'Cinematic',
    color: '#a891f6',
    rate: 1,
    filter: 'echo',
  },
  {
    id: 'demon',
    name: 'Demon Voice',
    shortName: 'Demon',
    description: 'A darker dimension. Subterranean pitch, spectral texture, and a sinister edge.',
    category: 'Cinematic',
    color: '#ee7b7b',
    rate: 0.58,
    filter: 'monster',
  },
  {
    id: 'narrator',
    name: 'The Narrator',
    shortName: 'Narrator',
    description: 'Every story deserves a great voice. A warm, steady, storytelling register.',
    category: 'Professional',
    color: '#f2ca83',
    rate: 0.89,
    badge: 'NEW',
  },
  {
    id: 'cyber',
    name: 'Cyberpunk',
    shortName: 'Cyberpunk',
    description: 'Straight from the neon underground. A gritty, mechanical transmission.',
    category: 'Robotic',
    color: '#c28aff',
    rate: 0.87,
    filter: 'metal',
    badge: 'NEW',
  },
  {
    id: 'helium',
    name: 'Helium',
    shortName: 'Helium',
    description: 'A little lift, a lot of laughs. Light-hearted high frequencies that float.',
    category: 'Fun',
    color: '#79dfe1',
    rate: 1.68,
  },
  {
    id: 'whisper',
    name: 'Soft Spoken',
    shortName: 'Soft spoken',
    description: 'Dial down the intensity. A gentle, intimate tone for close-up moments.',
    category: 'Human',
    color: '#bbafeb',
    rate: 0.95,
  },
];
export const getEffect = (id: string) => effects.find((e) => e.id === id) || effects[3];
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
};
export type HistoryEntry = {
  id: string;
  action: string;
  type: 'conversion' | 'upload' | 'export' | 'voice' | 'settings';
  detail: string;
  time: string;
  duration?: number;
  status: string;
  creationId?: string;
  demo?: boolean;
};
export type VoiceProfile = {
  id: string;
  name: string;
  url: string;
  duration: number;
  color: string;
  createdAt: string;
  blob?: Blob;
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
};

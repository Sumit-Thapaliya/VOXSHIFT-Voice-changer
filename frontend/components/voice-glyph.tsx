import { AudioLines, Radio, Waves, Ghost, BookOpen, Wind, Orbit, Sparkles } from 'lucide-react';
export function VoiceGlyph({
  id,
  size = 32,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 40 40',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className,
  };
  if (id === 'baby')
    return (
      <svg {...common}>
        <path d="M9 14c-6-2-7 9-1 10M31 14c6-2 7 9 1 10" stroke="currentColor" strokeWidth="2.3" />
        <ellipse
          cx="20"
          cy="21"
          rx="13"
          ry="14"
          fill="currentColor"
          fillOpacity=".16"
          stroke="currentColor"
          strokeWidth="2.3"
        />
        <path
          d="M17 7c0-6 8-5 6 0-1 3-5 1-4-1"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <circle cx="15" cy="20" r="1.5" fill="currentColor" />
        <circle cx="25" cy="20" r="1.5" fill="currentColor" />
        <path d="M16 27q4 4 8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="11" cy="25" r="2.2" fill="currentColor" fillOpacity=".35" />
        <circle cx="29" cy="25" r="2.2" fill="currentColor" fillOpacity=".35" />
      </svg>
    );
  if (id === 'female')
    return (
      <svg {...common}>
        <path
          d="M6 35c3-6 1-14 2-20C9 0 31 0 32 15c1 6-1 14 2 20-4 1-8-1-10-6h-8c-2 5-6 7-10 6Z"
          fill="currentColor"
        />
        <path d="M11 18c6 0 10-3 12-8 0 6 3 8 6 9-1 11-15 17-18-1Z" fill="#161b2d" />
        <path d="M17 26q3 3 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  if (id === 'male')
    return (
      <svg {...common}>
        <path d="M10 20c-5-2-4-8-1-10 1-7 10-8 14-5 7-1 11 4 9 11l-2 5" fill="currentColor" />
        <path
          d="m11 14 5-3 7 2 6 3v10c-1 6-6 10-9 10s-8-4-9-10Z"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="currentColor"
          fillOpacity=".12"
        />
        <path d="M9 21c-4-1-3 5 1 6M30 21c4-1 3 5-1 6" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    );
  if (id === 'robot' || id === 'cyber')
    return (
      <svg {...common}>
        <path d="M20 12V6" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="20" cy="5" r="2.8" fill="currentColor" />
        <rect x="6" y="12" width="28" height="23" rx="6" fill="currentColor" />
        <rect x="1" y="18" width="4" height="11" rx="2" fill="currentColor" />
        <rect x="35" y="18" width="4" height="11" rx="2" fill="currentColor" />
        <circle cx="14" cy="21" r="3" fill="#141c2a" />
        <circle cx="26" cy="21" r="3" fill="#141c2a" />
        <rect x="13" y="28" width="14" height="3" rx="1.5" fill="#141c2a" />
        <path d="M13 35v3m14-3v3" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  if (id === 'metallic')
    return (
      <svg {...common}>
        <path d="M8 9c5-6 19-6 24 0l4 16-5 11H9L4 25Z" fill="currentColor" fillOpacity=".75" />
        <path d="m9 16 4-6h14l4 6-3 7H12Z" fill="#151b29" />
        <path d="M13 15h4m6 0h4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M14 26v10m12-10v10M17 28h6M20 3v6" stroke="#151b29" strokeWidth="2.5" />
      </svg>
    );
  if (id === 'deep')
    return (
      <svg {...common}>
        <path d="M9 9c5-7 17-7 22 0l1 17c-3 8-8 12-12 12S11 34 8 26Z" fill="currentColor" />
        <path
          d="M10 10c6-2 11 4 20 0M13 19h3m8 0h3m-12 9q5-2 10 0"
          stroke="#192035"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  if (id === 'monster' || id === 'demon')
    return (
      <svg {...common}>
        <path d="M5 3v13l5 6v12c6 5 14 5 20 0V22l5-6V3l-8 10H13Z" fill="currentColor" />
        <path d="m10 21 7 3-1 4-5-3m19-4-7 3 1 4 5-3" fill="#131d20" />
        <path
          d="M13 32v-3l3 2 4-2 4 2 3-2v3"
          stroke="#131d20"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (id === 'alien')
    return (
      <svg {...common}>
        <path d="M5 16C5-1 35-1 35 16c0 12-10 22-15 22S5 28 5 16Z" fill="currentColor" />
        <ellipse cx="13" cy="21" rx="4.5" ry="6.5" transform="rotate(-34 13 21)" fill="#10221d" />
        <ellipse cx="27" cy="21" rx="4.5" ry="6.5" transform="rotate(34 27 21)" fill="#10221d" />
        <path d="M17 31h6" stroke="#10221d" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (id === 'chipmunk')
    return (
      <svg {...common}>
        <circle cx="8" cy="11" r="6" fill="currentColor" />
        <circle cx="32" cy="11" r="6" fill="currentColor" />
        <path d="M9 15c-2-14 24-14 22 0 12 9 5 23-11 23S-2 24 9 15Z" fill="currentColor" />
        <ellipse cx="20" cy="29" rx="9" ry="6" fill="#191e2b" fillOpacity=".3" />
        <circle cx="13" cy="20" r="2" fill="#1d2030" />
        <circle cx="27" cy="20" r="2" fill="#1d2030" />
        <path d="m17 25 3 3 3-3Z" fill="#1d2030" />
        <path d="M18 30h4v4h-4Z" fill="#fff4df" />
        <path d="M20 4v8" stroke="#191e2b" strokeWidth="2.4" />
      </svg>
    );
  const Icon =
    id === 'radio'
      ? Radio
      : id === 'echo'
        ? Waves
        : id === 'narrator'
          ? BookOpen
          : id === 'helium'
            ? Wind
            : id === 'whisper'
              ? AudioLines
              : id === 'demon'
                ? Ghost
                : id === 'alien'
                  ? Orbit
                  : Sparkles;
  return <Icon size={size} className={className} strokeWidth={1.8} />;
}

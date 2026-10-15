'use client';
import { useEffect, useRef, useId } from 'react';
import gsap from 'gsap';
import { Play, Pause, AudioLines } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from './providers';
import { getEffect } from '@/lib/data';
const round = (n: number) => Number(n.toFixed(3));
export function MiniWave({
  color = '#77d9e9',
  bars = 48,
  active = false,
  seed = 2,
  className,
  progress = 0,
}: {
  color?: string;
  bars?: number;
  active?: boolean;
  seed?: number;
  className?: string;
  progress?: number;
}) {
  return (
    <div className={cn('mini-wave', active && 'wave-active', className)} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const h = 12 + Math.abs(Math.sin(i * 0.82 + seed) * Math.cos(i * 0.29 + seed * 0.3)) * 85;
        return (
          <i
            key={i}
            style={{
              height: `${round(h)}%`,
              background: color,
              opacity: progress > 0 ? (i / bars < progress ? 1 : 0.32) : 0.7,
              animationDelay: `${round(i * 0.041)}s`,
            }}
          />
        );
      })}
    </div>
  );
}
export function VoiceOrb({ compact = false }: { compact?: boolean }) {
  const { selectedEffect, player, previewEffect, preferences, getAnalyser } = useStudio();
  const effect = getEffect(selectedEffect);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replaceAll(':', '');
  const active = player.playing && player.effectId === selectedEffect;
  useEffect(() => {
    if (
      !ref.current ||
      !preferences.motion ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const context = gsap.context(() => {
      gsap.to('.orb-satellite', {
        rotation: 360,
        duration: 32,
        repeat: -1,
        ease: 'none',
        transformOrigin: '50% 50%',
      });
      gsap.to('.orb-dashed', {
        rotation: -360,
        duration: 60,
        repeat: -1,
        ease: 'none',
        transformOrigin: '50% 50%',
      });
      gsap.to('.orb-core', { y: -4, duration: 3.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }, ref);
    return () => context.revert();
  }, [preferences.motion]);
  useEffect(() => {
    if (
      !player.playing ||
      !preferences.motion ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    let frame = 0,
      last = 0;
    const analyser = getAnalyser();
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const lines = ref.current?.querySelectorAll<SVGLineElement>('.orb-frequency');
    const animate = (time: number) => {
      if (time - last > 33 && lines) {
        last = time;
        analyser.getByteFrequencyData(data);
        let energy = 0;
        for (let i = 0; i < data.length; i++) energy += data[i];
        ref.current?.style.setProperty('--audio-energy', String(energy / (data.length * 255)));
        lines.forEach((line, i) => {
          const theta = (i * 5 * Math.PI) / 180;
          const amplitude = data[(i % 42) + 2] / 255;
          const h = 5 + amplitude * 35;
          line.setAttribute('x2', String(170 + Math.sin(theta) * (147 + h)));
          line.setAttribute('y2', String(170 - Math.cos(theta) * (147 + h)));
        });
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [player.playing, preferences.motion, getAnalyser]);
  return (
    <div ref={ref} className={cn('voice-orb', compact && 'orb-compact', active && 'orb-active')}>
      <div className="orb-halo" />
      <svg viewBox="0 0 340 340" className="orb-svg" aria-hidden="true">
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#75e9f4" />
            <stop offset=".5" stopColor="#6b88ed" />
            <stop offset="1" stopColor="#bd6ef4" />
          </linearGradient>
        </defs>
        <g className="orb-dashed">
          <circle
            cx="170"
            cy="170"
            r="154"
            stroke="#7184c4"
            strokeOpacity=".28"
            strokeWidth="1"
            strokeDasharray="1 9"
            fill="none"
          />
        </g>
        <circle
          cx="170"
          cy="170"
          r="136"
          stroke="#485a9c"
          strokeOpacity=".38"
          strokeWidth="1"
          fill="none"
        />
        <circle
          cx="170"
          cy="170"
          r="119"
          stroke={`url(#ring-${id})`}
          strokeOpacity=".47"
          strokeWidth="1"
          fill="none"
        />
        <circle
          cx="170"
          cy="170"
          r="101"
          stroke="#5269af"
          strokeOpacity=".2"
          strokeWidth="12"
          fill="none"
        />
        <g className="orb-satellite">
          <circle
            cx="170"
            cy="170"
            r="137"
            stroke={`url(#ring-${id})`}
            strokeWidth="2"
            strokeDasharray="72 355 20 480"
            fill="none"
          />
          <circle cx="170" cy="33" r="3" fill="#8cedf3" />
          <circle cx="170" cy="307" r="2" fill="#b488ef" />
        </g>
        {Array.from({ length: 72 }, (_, i) => {
          const theta = (i * 5 * Math.PI) / 180;
          const h = 4 + Math.pow(Math.sin(i * 0.54), 2) * 18 + (i % 18 === 0 ? 16 : 0);
          const r = 147;
          return (
            <line
              className="orb-frequency"
              key={i}
              x1={round(170 + Math.sin(theta) * r)}
              y1={round(170 - Math.cos(theta) * r)}
              x2={round(170 + Math.sin(theta) * (r + h))}
              y2={round(170 - Math.cos(theta) * (r + h))}
              stroke={i > 20 && i < 48 ? '#a16fe8' : '#74dce7'}
              strokeOpacity={i % 3 === 0 ? 0.85 : 0.37}
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{ animationDelay: `${round(i * 0.04)}s` }}
            />
          );
        })}
        {Array.from({ length: 22 }, (_, i) => {
          const t = (((i * 97) % 360) * Math.PI) / 180;
          const r = 103 + (i % 5) * 16;
          return (
            <circle
              key={i}
              cx={round(170 + Math.sin(t) * r)}
              cy={round(170 + Math.cos(t) * r)}
              r={i % 4 === 0 ? 1.6 : 0.8}
              fill={i % 2 === 0 ? '#b49af9' : '#b2ebf8'}
              opacity=".55"
            />
          );
        })}
      </svg>
      <button
        className="orb-core"
        onClick={() => previewEffect(selectedEffect)}
        aria-label={`${active ? 'Pause' : 'Preview'} ${effect.name}`}
      >
        <span className="orb-gloss" />
        <AudioLines size={53} strokeWidth={1.9} />
        <span className="orb-play">
          {active ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
        </span>
      </button>
      {!compact && (
        <div className="orb-caption">
          <span className={cn('status-dot', active && 'pulsing')} />
          <span>{active ? 'PREVIEWING YOUR NEW VOICE' : 'VOICE ENGINE READY'}</span>
          <p>
            {effect.name}
            <span> · </span>
            {active ? 'Click orb to pause' : 'Click orb to preview'}
          </p>
        </div>
      )}
    </div>
  );
}
export function EngineChip() {
  const id = useId().replaceAll(':', '');
  return (
    <svg className="engine-chip" viewBox="0 0 210 140" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id={`chip-${id}`}
          x1="50"
          y1="30"
          x2="155"
          y2="110"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#69dfec" />
          <stop offset=".4" stopColor="#5e80c8" />
          <stop offset="1" stopColor="#a271e8" />
        </linearGradient>
        <filter id={`glow-${id}`}>
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {Array.from({ length: 5 }, (_, i) => (
        <g key={i} stroke="#4c66a1" strokeOpacity=".35">
          <path
            d={`M${30 + i * 7} ${25 + i * 8}L${70 + i * 3} ${46 + i * 7}M${140 + i * 4} ${35 + i * 8}L${184 + i * 7} ${12 + i * 12}M${30 + i * 4} ${130 - i * 8}L${75 + i * 3} ${105 - i * 7}M${140 + i * 3} ${94 - i * 4}L${195 + i * 2} ${120 - i * 8}`}
          />
        </g>
      ))}
      <path
        d="m105 35 62 34-62 37-62-37Z"
        fill="#53cdea"
        opacity=".4"
        filter={`url(#glow-${id})`}
      />
      <path d="m105 43 59 34-59 36-59-36Z" fill="#182745" stroke="#5476bd" strokeWidth="1" />
      <path d="m105 35 59 34-59 36-59-36Z" fill="#243654" stroke="#78a2d7" />
      <path d="m105 29 50 29-50 30-50-30Z" fill={`url(#chip-${id})`} stroke="#a9e5fa" />
      <path
        d="m105 36 37 22-37 23-37-23Z"
        fill="#4c67a3"
        fillOpacity=".65"
        stroke="#8dd3f0"
        strokeOpacity=".7"
      />
      <text
        x="105"
        y="64"
        fill="#d4fbff"
        fontFamily="Space Grotesk, sans-serif"
        fontSize="21"
        fontWeight="700"
        textAnchor="middle"
        transform="rotate(-1 105 64)"
      >
        VX
      </text>
      <path d="m55 76 50 29 50-29" stroke="#b99ff2" strokeWidth="2" strokeOpacity=".8" />
      <circle cx="169" cy="44" r="2" fill="#7ae8e9" />
      <circle cx="47" cy="108" r="1.7" fill="#b49dec" />
    </svg>
  );
}

import { useId } from 'react';
import { cn } from '@/lib/utils';
export function ContourPanel({
  children,
  className,
  tint = 'violet',
}: {
  children: React.ReactNode;
  className?: string;
  tint?: 'violet' | 'cyan';
}) {
  const id = useId().replaceAll(':', '');
  return (
    <div className={cn('contour-panel', className)}>
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="none"
        className="panel-contour"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`panel-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#131728" />
            <stop offset="1" stopColor="#0d111d" />
          </linearGradient>
          <radialGradient id={`tint-${id}`} cx=".98" cy="0" r=".9">
            <stop stopColor={tint === 'cyan' ? '#68d9e7' : '#9391ea'} stopOpacity=".17" />
            <stop offset=".7" stopColor="#171b2f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`stroke-${id}`} x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="#353b50" stopOpacity=".8" />
            <stop offset=".7" stopColor="#515674" />
            <stop offset="1" stopColor={tint === 'cyan' ? '#74bcbe' : '#797dc0'} />
          </linearGradient>
        </defs>
        <path
          d="M18 1H240C259 1 259 27 280 27H380Q399 27 399 46V281Q399 299 381 299H18Q1 299 1 281V19Q1 1 18 1Z"
          fill={`url(#panel-${id})`}
        />
        <path
          d="M18 1H240C259 1 259 27 280 27H380Q399 27 399 46V281Q399 299 381 299H18Q1 299 1 281V19Q1 1 18 1Z"
          fill={`url(#tint-${id})`}
          stroke={`url(#stroke-${id})`}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {children}
    </div>
  );
}

'use client';

const PATTERNS = ['/pattern-1.png', '/pattern-2.png', '/pattern-3.png'];

const BRAND_COLORS = ['#F2C84B', '#F27289', '#84D9D0', '#F27405', '#49B3BF', '#580459'];
const ANIMATIONS = ['float-a', 'float-b', 'float-c'];

const BLOBS: { x: number; y: number; size: number; colorIdx: number; animIdx: number; rotation: number; delay: number }[] = [
  { x: 5, y: 10, size: 45, colorIdx: 0, animIdx: 0, rotation: 12, delay: 0 },
  { x: 85, y: 8, size: 35, colorIdx: 1, animIdx: 1, rotation: -20, delay: 0.5 },
  { x: 15, y: 75, size: 50, colorIdx: 2, animIdx: 2, rotation: 30, delay: 1 },
  { x: 90, y: 65, size: 40, colorIdx: 3, animIdx: 0, rotation: -15, delay: 1.5 },
  { x: 50, y: 5, size: 30, colorIdx: 4, animIdx: 1, rotation: 25, delay: 2 },
  { x: 30, y: 85, size: 55, colorIdx: 5, animIdx: 2, rotation: -10, delay: 2.5 },
  { x: 70, y: 30, size: 25, colorIdx: 0, animIdx: 0, rotation: 45, delay: 3 },
  { x: 10, y: 45, size: 38, colorIdx: 1, animIdx: 1, rotation: -35, delay: 3.5 },
  { x: 60, y: 80, size: 42, colorIdx: 2, animIdx: 2, rotation: 18, delay: 4 },
  { x: 95, y: 40, size: 28, colorIdx: 3, animIdx: 0, rotation: -22, delay: 4.5 },
  { x: 40, y: 20, size: 33, colorIdx: 4, animIdx: 1, rotation: 38, delay: 5 },
  { x: 75, y: 90, size: 48, colorIdx: 5, animIdx: 2, rotation: -28, delay: 5.5 },
  { x: 20, y: 55, size: 22, colorIdx: 0, animIdx: 0, rotation: 15, delay: 6 },
  { x: 55, y: 45, size: 36, colorIdx: 1, animIdx: 1, rotation: -40, delay: 6.5 },
  { x: 80, y: 15, size: 44, colorIdx: 2, animIdx: 2, rotation: 22, delay: 7 },
  { x: 35, y: 60, size: 26, colorIdx: 3, animIdx: 0, rotation: -18, delay: 7.5 },
  { x: 65, y: 50, size: 32, colorIdx: 4, animIdx: 1, rotation: 32, delay: 8 },
  { x: 45, y: 35, size: 20, colorIdx: 5, animIdx: 2, rotation: -8, delay: 8.5 },
];

interface ConfettiBackgroundProps {
  className?: string;
  children: React.ReactNode;
  patternIndex?: number;
}

export default function ConfettiBackground({ className = '', children, patternIndex }: ConfettiBackgroundProps) {
  const idx = patternIndex ?? 0;
  // Use fewer blobs for better mobile performance
  const visibleBlobs = typeof window !== 'undefined' && window.innerWidth < 640 ? BLOBS.slice(0, 8) : BLOBS;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {idx === 0 ? (
        <div className="absolute inset-0 pointer-events-none motion-reduce:hidden" aria-hidden="true">
          {visibleBlobs.map((b, i) => (
            <div
              key={i}
              className="absolute will-change-transform"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: b.size,
                height: b.size,
                backgroundColor: BRAND_COLORS[b.colorIdx],
                opacity: 0.18,
                borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
                transform: `rotate(${b.rotation}deg)`,
                animation: `${ANIMATIONS[b.animIdx]} ${6 + b.animIdx * 2}s ease-in-out infinite`,
                animationDelay: `${b.delay}s`,
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${PATTERNS[idx]})`,
            backgroundSize: '500px',
            backgroundRepeat: 'repeat',
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

'use client';

const PATTERNS = ['/pattern-1.png', '/pattern-2.png', '/pattern-3.png'];

interface ConfettiBackgroundProps {
  className?: string;
  children: React.ReactNode;
  patternIndex?: number;
}

export default function ConfettiBackground({ className = '', children, patternIndex }: ConfettiBackgroundProps) {
  const pattern = PATTERNS[patternIndex ?? 0];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        aria-hidden="true"
        style={{
          backgroundImage: `url(${pattern})`,
          backgroundSize: '500px',
          backgroundRepeat: 'repeat',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

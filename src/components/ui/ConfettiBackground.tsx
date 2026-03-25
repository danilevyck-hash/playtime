'use client';

interface ConfettiBackgroundProps {
  className?: string;
  children: React.ReactNode;
}

// 25 pre-defined brush strokes with fixed positions for SSR consistency
// Colors: orange #F27405, pink #F27289, teal #84D9D0, yellow #F2C84B, teal2 #49B3BF
const STROKES: { top: string; left: string; w: string; h: string; color: string; rotate: string; opacity: string }[] = [
  { top: '4%', left: '3%', w: '40px', h: '14px', color: '#F27405', rotate: '-20deg', opacity: '0.25' },
  { top: '7%', left: '82%', w: '35px', h: '12px', color: '#84D9D0', rotate: '15deg', opacity: '0.3' },
  { top: '12%', left: '28%', w: '30px', h: '30px', color: '#F27289', rotate: '0deg', opacity: '0.2' },
  { top: '6%', left: '55%', w: '38px', h: '13px', color: '#F2C84B', rotate: '30deg', opacity: '0.3' },
  { top: '18%', left: '90%', w: '32px', h: '11px', color: '#49B3BF', rotate: '-10deg', opacity: '0.25' },
  { top: '22%', left: '8%', w: '42px', h: '15px', color: '#F2C84B', rotate: '-35deg', opacity: '0.2' },
  { top: '28%', left: '70%', w: '28px', h: '28px', color: '#F27405', rotate: '25deg', opacity: '0.2' },
  { top: '33%', left: '45%', w: '36px', h: '12px', color: '#84D9D0', rotate: '-15deg', opacity: '0.25' },
  { top: '38%', left: '15%', w: '34px', h: '34px', color: '#F27289', rotate: '45deg', opacity: '0.15' },
  { top: '35%', left: '88%', w: '30px', h: '10px', color: '#49B3BF', rotate: '20deg', opacity: '0.3' },
  { top: '42%', left: '60%', w: '26px', h: '26px', color: '#F2C84B', rotate: '0deg', opacity: '0.2' },
  { top: '48%', left: '2%', w: '38px', h: '13px', color: '#F27405', rotate: '35deg', opacity: '0.25' },
  { top: '52%', left: '38%', w: '32px', h: '11px', color: '#84D9D0', rotate: '-25deg', opacity: '0.2' },
  { top: '55%', left: '78%', w: '40px', h: '14px', color: '#F27289', rotate: '10deg', opacity: '0.25' },
  { top: '60%', left: '20%', w: '28px', h: '28px', color: '#49B3BF', rotate: '-40deg', opacity: '0.2' },
  { top: '58%', left: '92%', w: '30px', h: '10px', color: '#F2C84B', rotate: '15deg', opacity: '0.3' },
  { top: '65%', left: '50%', w: '36px', h: '12px', color: '#F27405', rotate: '-20deg', opacity: '0.2' },
  { top: '70%', left: '5%', w: '34px', h: '12px', color: '#84D9D0', rotate: '30deg', opacity: '0.25' },
  { top: '72%', left: '68%', w: '26px', h: '26px', color: '#F27289', rotate: '0deg', opacity: '0.2' },
  { top: '78%', left: '35%', w: '38px', h: '13px', color: '#49B3BF', rotate: '-30deg', opacity: '0.25' },
  { top: '80%', left: '85%', w: '32px', h: '11px', color: '#F2C84B', rotate: '20deg', opacity: '0.2' },
  { top: '85%', left: '12%', w: '40px', h: '14px', color: '#F27405', rotate: '40deg', opacity: '0.2' },
  { top: '88%', left: '55%', w: '30px', h: '30px', color: '#84D9D0', rotate: '-15deg', opacity: '0.15' },
  { top: '92%', left: '75%', w: '36px', h: '12px', color: '#F27289', rotate: '25deg', opacity: '0.25' },
  { top: '95%', left: '25%', w: '34px', h: '12px', color: '#49B3BF', rotate: '-10deg', opacity: '0.3' },
];

export default function ConfettiBackground({ className = '', children }: ConfettiBackgroundProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {STROKES.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              top: s.top,
              left: s.left,
              width: s.w,
              height: s.h,
              backgroundColor: s.color,
              opacity: s.opacity,
              transform: `rotate(${s.rotate})`,
              filter: 'blur(1px)',
            }}
          />
        ))}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

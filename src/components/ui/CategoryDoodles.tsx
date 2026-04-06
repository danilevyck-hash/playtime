// Hand-drawn doodle SVG icons for each category, matching PlayTime brand style
// Colors: purple #580459, teal #49B3BF, pink #F27289, orange #F27405, yellow #F2C84B

export function DoodlePlanes({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Party hat */}
      <path d="M32 8L18 52h28L32 8z" stroke="#580459" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="#F2C84B" fillOpacity="0.2"/>
      <path d="M22 38h20" stroke="#49B3BF" strokeWidth="2" strokeLinecap="round"/>
      <path d="M25 30h14" stroke="#F27289" strokeWidth="2" strokeLinecap="round"/>
      <path d="M28 22h8" stroke="#F27405" strokeWidth="2" strokeLinecap="round"/>
      {/* Confetti */}
      <circle cx="12" cy="20" r="2" fill="#F27289"/>
      <circle cx="52" cy="16" r="2" fill="#49B3BF"/>
      <path d="M8 35l4-3" stroke="#F2C84B" strokeWidth="2" strokeLinecap="round"/>
      <path d="M54 28l3 4" stroke="#F27405" strokeWidth="2" strokeLinecap="round"/>
      <path d="M48 42l4 1" stroke="#F27289" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function DoodleBelleza({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Nail polish bottle */}
      <rect x="22" y="28" width="20" height="28" rx="4" stroke="#580459" strokeWidth="2.5" fill="#F27289" fillOpacity="0.2"/>
      <rect x="26" y="16" width="12" height="14" rx="2" stroke="#580459" strokeWidth="2.5" fill="#F27289" fillOpacity="0.15"/>
      <rect x="30" y="8" width="4" height="10" rx="1" stroke="#580459" strokeWidth="2" fill="#580459" fillOpacity="0.1"/>
      {/* Sparkles */}
      <path d="M14 20l2-4 2 4-4-2 4-2z" fill="#F2C84B"/>
      <path d="M48 14l1.5-3 1.5 3-3-1.5 3-1.5z" fill="#49B3BF"/>
      <circle cx="50" cy="36" r="1.5" fill="#F27289"/>
    </svg>
  );
}

export function DoodleEntretenimiento({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Theatre mask */}
      <path d="M16 22c0 16 10 26 16 26s16-10 16-26" stroke="#580459" strokeWidth="2.5" strokeLinecap="round" fill="#49B3BF" fillOpacity="0.15"/>
      <path d="M16 22c0-4 7-10 16-10s16 6 16 10" stroke="#580459" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Eyes */}
      <circle cx="26" cy="26" r="3" fill="#580459"/>
      <circle cx="38" cy="26" r="3" fill="#580459"/>
      {/* Smile */}
      <path d="M26 36c2 3 8 3 10 0" stroke="#580459" strokeWidth="2" strokeLinecap="round"/>
      {/* Stars */}
      <path d="M8 16l1.5-3 1.5 3-3-1.5 3-1.5z" fill="#F2C84B"/>
      <path d="M52 12l1.5-3 1.5 3-3-1.5 3-1.5z" fill="#F27289"/>
    </svg>
  );
}

export function DoodleSnacks({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Popcorn box */}
      <path d="M18 26l4 30h20l4-30H18z" stroke="#580459" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="#49B3BF" fillOpacity="0.15"/>
      <path d="M18 26h28" stroke="#580459" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Stripes on box */}
      <path d="M24 26l2 30" stroke="#F27289" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M34 26l-2 30" stroke="#F27289" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Popcorn kernels */}
      <circle cx="26" cy="20" r="4" stroke="#F2C84B" strokeWidth="2" fill="#F2C84B" fillOpacity="0.3"/>
      <circle cx="34" cy="18" r="4" stroke="#F2C84B" strokeWidth="2" fill="#F2C84B" fillOpacity="0.3"/>
      <circle cx="30" cy="14" r="4" stroke="#F2C84B" strokeWidth="2" fill="#F2C84B" fillOpacity="0.3"/>
      <circle cx="22" cy="16" r="3" stroke="#F2C84B" strokeWidth="2" fill="#F2C84B" fillOpacity="0.3"/>
      <circle cx="38" cy="16" r="3" stroke="#F2C84B" strokeWidth="2" fill="#F2C84B" fillOpacity="0.3"/>
    </svg>
  );
}

export function DoodleGymboree({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Castle/fort */}
      <rect x="14" y="24" width="36" height="32" rx="2" stroke="#580459" strokeWidth="2.5" fill="#49B3BF" fillOpacity="0.12"/>
      {/* Towers */}
      <rect x="14" y="16" width="8" height="10" stroke="#580459" strokeWidth="2" fill="#F27289" fillOpacity="0.2"/>
      <rect x="42" y="16" width="8" height="10" stroke="#580459" strokeWidth="2" fill="#F27289" fillOpacity="0.2"/>
      {/* Battlements */}
      <rect x="14" y="12" width="3" height="5" fill="#580459" fillOpacity="0.3"/>
      <rect x="19" y="12" width="3" height="5" fill="#580459" fillOpacity="0.3"/>
      <rect x="42" y="12" width="3" height="5" fill="#580459" fillOpacity="0.3"/>
      <rect x="47" y="12" width="3" height="5" fill="#580459" fillOpacity="0.3"/>
      {/* Door */}
      <path d="M28 56V40a4 4 0 018 0v16" stroke="#580459" strokeWidth="2" fill="#F2C84B" fillOpacity="0.2"/>
      {/* Flag */}
      <path d="M32 8v10" stroke="#580459" strokeWidth="2" strokeLinecap="round"/>
      <path d="M32 8l8 4-8 4" fill="#F27289" fillOpacity="0.5" stroke="#F27289" strokeWidth="1.5"/>
    </svg>
  );
}

export function DoodleInflables({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Bounce house shape */}
      <path d="M10 52h44" stroke="#580459" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M12 52V28c0-12 8-18 20-18s20 6 20 18v24" stroke="#580459" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="#F27289" fillOpacity="0.15"/>
      {/* Arch entrance */}
      <path d="M24 52V38a8 8 0 0116 0v14" stroke="#580459" strokeWidth="2" fill="#49B3BF" fillOpacity="0.2"/>
      {/* Towers */}
      <path d="M14 28v-6" stroke="#580459" strokeWidth="3" strokeLinecap="round"/>
      <path d="M50 28v-6" stroke="#580459" strokeWidth="3" strokeLinecap="round"/>
      {/* Stars */}
      <path d="M32 22l1-2 1 2-2-1 2-1z" fill="#F2C84B"/>
    </svg>
  );
}

export function DoodlePiscinas({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ball pit / pool */}
      <ellipse cx="32" cy="40" rx="24" ry="14" stroke="#580459" strokeWidth="2.5" fill="#49B3BF" fillOpacity="0.15"/>
      {/* Balls */}
      <circle cx="22" cy="36" r="5" stroke="#F27289" strokeWidth="2" fill="#F27289" fillOpacity="0.3"/>
      <circle cx="34" cy="34" r="5" stroke="#49B3BF" strokeWidth="2" fill="#49B3BF" fillOpacity="0.3"/>
      <circle cx="42" cy="38" r="5" stroke="#F2C84B" strokeWidth="2" fill="#F2C84B" fillOpacity="0.3"/>
      <circle cx="28" cy="42" r="4" stroke="#F27405" strokeWidth="2" fill="#F27405" fillOpacity="0.3"/>
      <circle cx="38" cy="44" r="4" stroke="#580459" strokeWidth="2" fill="#580459" fillOpacity="0.15"/>
      <circle cx="26" cy="30" r="4" stroke="#F2C84B" strokeWidth="2" fill="#F2C84B" fillOpacity="0.3"/>
    </svg>
  );
}

export function DoodleAlquiler({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Balloon */}
      <ellipse cx="32" cy="24" rx="14" ry="18" stroke="#580459" strokeWidth="2.5" fill="#F27289" fillOpacity="0.2"/>
      <path d="M32 42l-3 4h6l-3-4z" stroke="#580459" strokeWidth="2" strokeLinejoin="round"/>
      {/* String */}
      <path d="M32 46c-2 4 2 8-2 12" stroke="#580459" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Shine */}
      <ellipse cx="26" cy="18" rx="2" ry="4" fill="white" fillOpacity="0.4" transform="rotate(-15 26 18)"/>
    </svg>
  );
}

export function DoodleServicios({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Music notes */}
      <circle cx="20" cy="44" r="6" stroke="#580459" strokeWidth="2.5" fill="#49B3BF" fillOpacity="0.2"/>
      <path d="M26 44V14" stroke="#580459" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M26 14l18-4v28" stroke="#580459" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="38" cy="38" r="6" stroke="#580459" strokeWidth="2.5" fill="#F27289" fillOpacity="0.2"/>
      {/* Notes */}
      <path d="M10 20l1.5-3 1.5 3-3-1.5 3-1.5z" fill="#F2C84B"/>
      <path d="M50 24l1.5-3 1.5 3-3-1.5 3-1.5z" fill="#F27289"/>
    </svg>
  );
}

export function DoodleManualidades({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Paint palette */}
      <path d="M32 10C18 10 8 20 8 32c0 14 12 22 24 22 4 0 6-2 6-4 0-1-.5-2-1-3-1-1-1.5-2-1.5-3 0-3 2-4 6-4 6 0 14-6 14-14 0-12-10-16-24-16z" stroke="#580459" strokeWidth="2.5" fill="#F2C84B" fillOpacity="0.1"/>
      {/* Paint dots */}
      <circle cx="20" cy="24" r="4" fill="#F27289" fillOpacity="0.6"/>
      <circle cx="32" cy="18" r="4" fill="#49B3BF" fillOpacity="0.6"/>
      <circle cx="42" cy="24" r="4" fill="#F2C84B" fillOpacity="0.6"/>
      <circle cx="18" cy="36" r="4" fill="#F27405" fillOpacity="0.6"/>
      {/* Paintbrush stroke */}
      <path d="M48 8l-6 14" stroke="#580459" strokeWidth="2" strokeLinecap="round"/>
      <path d="M50 6l-2 2" stroke="#F27289" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

// Map category IDs to doodle components
export const CATEGORY_DOODLES: Record<string, React.FC<{ className?: string }>> = {
  planes: DoodlePlanes,
  spa: DoodleBelleza,
  show: DoodleEntretenimiento,
  snacks: DoodleSnacks,
  softplay: DoodleGymboree,
  bounces: DoodleInflables,

  addons: DoodleAlquiler,
  creative: DoodleManualidades,
};

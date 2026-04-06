'use client';

const STEPS = ['Datos', 'Evento', 'Confirmar'];

interface StepIndicatorProps {
  current: number;
}

export default function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <nav aria-label="Progreso del pedido" className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <div
              role="listitem"
              aria-current={i === current ? 'step' : undefined}
              aria-label={`Paso ${i + 1}: ${label}${i < current ? ' (completado)' : i === current ? ' (actual)' : ''}`}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-heading font-bold transition-colors ${
                i < current
                  ? 'bg-teal text-white'
                  : i === current
                  ? 'bg-purple text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              {i < current ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs mt-1 font-heading hidden sm:block ${i === current ? 'text-purple font-semibold' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 sm:w-12 h-0.5 mb-5 ${i < current ? 'bg-teal' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </nav>
  );
}

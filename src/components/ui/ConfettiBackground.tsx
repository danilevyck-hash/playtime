'use client';

interface ConfettiBackgroundProps {
  className?: string;
  children: React.ReactNode;
}

export default function ConfettiBackground({ className = '', children }: ConfettiBackgroundProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* Brush strokes inspired by brandbook page 6 */}
        <div className="absolute top-[8%] left-[5%] w-8 h-5 bg-teal/30 rounded-full rotate-[-25deg] blur-[1px]" />
        <div className="absolute top-[12%] right-[15%] w-6 h-4 bg-orange/30 rounded-full rotate-[15deg] blur-[1px]" />
        <div className="absolute top-[20%] left-[25%] w-5 h-5 bg-pink/25 rounded-full blur-[1px]" />
        <div className="absolute top-[5%] right-[35%] w-7 h-4 bg-yellow/35 rounded-full rotate-[30deg] blur-[1px]" />
        <div className="absolute top-[30%] right-[8%] w-6 h-6 bg-mint/30 rounded-full blur-[1px]" />
        <div className="absolute top-[35%] left-[12%] w-8 h-4 bg-orange/25 rounded-full rotate-[-15deg] blur-[1px]" />
        <div className="absolute bottom-[25%] right-[22%] w-5 h-5 bg-pink/30 rounded-full blur-[1px]" />
        <div className="absolute bottom-[15%] left-[30%] w-7 h-4 bg-teal/25 rounded-full rotate-[20deg] blur-[1px]" />
        <div className="absolute bottom-[10%] right-[40%] w-6 h-5 bg-yellow/30 rounded-full rotate-[-10deg] blur-[1px]" />
        <div className="absolute bottom-[30%] left-[45%] w-5 h-4 bg-mint/25 rounded-full rotate-[35deg] blur-[1px]" />
        <div className="absolute top-[50%] left-[60%] w-4 h-4 bg-orange/20 rounded-full blur-[1px]" />
        <div className="absolute top-[45%] right-[50%] w-6 h-3 bg-pink/20 rounded-full rotate-[45deg] blur-[1px]" />
        <div className="absolute bottom-[5%] left-[8%] w-5 h-5 bg-yellow/25 rounded-full blur-[1px]" />
        <div className="absolute bottom-[8%] right-[10%] w-7 h-4 bg-teal/30 rounded-full rotate-[-30deg] blur-[1px]" />
        <div className="absolute top-[65%] left-[75%] w-4 h-6 bg-orange/25 rounded-full rotate-[10deg] blur-[1px]" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

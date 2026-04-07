'use client';

import { useRef, useEffect } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function Input({ label, error, className = '', required, value, placeholder, ...props }: InputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const hasValue = value !== undefined && value !== '';

  useEffect(() => {
    if (ref.current) {
      ref.current.oninvalid = (e) => {
        e.preventDefault();
        const input = e.target as HTMLInputElement;
        if (input.validity.valueMissing) {
          input.setCustomValidity('');
        }
      };
      ref.current.oninput = () => {
        ref.current?.setCustomValidity('');
      };
    }
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <input
          ref={ref}
          required={required}
          value={value}
          placeholder=" "
          className={`peer w-full px-4 pt-6 pb-2 rounded-xl border-2 border-gray-200 bg-white font-body text-gray-800 focus:border-teal focus:outline-none transition-colors ${error ? 'border-pink' : ''} ${className}`}
          {...props}
        />
        <label className={`absolute left-4 transition-all pointer-events-none font-heading font-semibold ${
          hasValue
            ? 'top-1.5 text-[10px] text-teal'
            : 'top-1/2 -translate-y-1/2 text-sm text-gray-400 peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:text-teal peer-[:not(:placeholder-shown)]:top-1.5 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:text-teal'
        }`}>
          {label}
        </label>
        {/* Placeholder visible only when focused and empty */}
        {placeholder && !hasValue && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-300 pointer-events-none opacity-0 peer-focus:opacity-100 peer-focus:top-[60%] transition-all font-body">
            {placeholder}
          </span>
        )}
      </div>
      {error && (
        <span className="text-xs text-pink font-body flex items-center gap-1">
          <span className="text-pink">*</span> {error}
        </span>
      )}
    </div>
  );
}

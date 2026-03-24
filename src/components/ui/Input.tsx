'use client';

import { useRef, useEffect } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function Input({ label, error, className = '', required, ...props }: InputProps) {
  const ref = useRef<HTMLInputElement>(null);

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
      <label className="text-sm font-heading font-semibold text-gray-700">
        {label}
      </label>
      <input
        ref={ref}
        required={required}
        className={`w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 bg-white font-body text-gray-800 placeholder:text-gray-400 focus:border-teal focus:outline-none transition-colors ${error ? 'border-pink' : ''} ${className}`}
        {...props}
      />
      {error && (
        <span className="text-xs text-pink font-body flex items-center gap-1">
          <span className="text-pink">*</span> {error}
        </span>
      )}
    </div>
  );
}

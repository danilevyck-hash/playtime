'use client';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-heading font-semibold text-gray-700">
        {label}
      </label>
      <input
        className={`w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 bg-white font-body text-gray-800 placeholder:text-gray-400 focus:border-teal focus:outline-none transition-colors ${error ? 'border-pink' : ''} ${className}`}
        {...props}
      />
      {error && <span className="text-sm text-pink font-body">{error}</span>}
    </div>
  );
}

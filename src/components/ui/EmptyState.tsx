interface EmptyStateProps {
  icon?: 'cart' | 'search' | 'party';
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

const ICONS = {
  cart: (
    <svg className="w-16 h-16 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  ),
  search: (
    <svg className="w-16 h-16 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  party: (
    <svg className="w-16 h-16 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  ),
};

export default function EmptyState({ icon = 'party', title, subtitle, children }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="flex justify-center mb-4">{ICONS[icon]}</div>
      <h2 className="font-heading font-bold text-lg text-gray-400 mb-1">{title}</h2>
      {subtitle && <p className="font-body text-sm text-gray-400 mb-6">{subtitle}</p>}
      {children}
    </div>
  );
}

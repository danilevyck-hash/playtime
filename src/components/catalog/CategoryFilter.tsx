'use client';

import { Category } from '@/lib/types';
import { useCategories } from '@/lib/useCategories';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';

const MAIN_ORDER: Category[] = ['planes', 'entretenimiento', 'belleza', 'gymboree', 'inflables', 'snacks'];
const EXTRA_ORDER: Category[] = ['alquiler', 'piscinas', 'servicios', 'manualidades'];

interface CategoryFilterProps {
  selected: Category | 'all';
  onSelect: (category: Category | 'all') => void;
}

export default function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  const categories = useCategories();

  const mainCats = MAIN_ORDER.map(id => categories.find(c => c.id === id)).filter(Boolean) as typeof categories;
  const extraCats = EXTRA_ORDER.map(id => categories.find(c => c.id === id)).filter(Boolean) as typeof categories;

  return (
    <div>
      {/* "Todos" pill */}
      <button
        onClick={() => onSelect('all')}
        className={`mb-4 px-5 py-2 rounded-full font-heading font-semibold text-sm transition-all ${
          selected === 'all'
            ? 'bg-teal text-white shadow-md'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Todos
      </button>

      {/* Main categories — grid 3x2 mobile, 6 cols desktop */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {mainCats.map((cat) => {
          const Doodle = CATEGORY_DOODLES[cat.id];
          const isActive = selected === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`flex flex-col items-center p-3 rounded-2xl border transition-all cursor-pointer ${
                isActive
                  ? 'border-teal bg-teal/5 shadow-md'
                  : 'border-gray-100 bg-white shadow-sm hover:border-teal/50'
              }`}
            >
              {Doodle ? <Doodle className="w-10 h-10" /> : <span className="text-2xl">{cat.icon}</span>}
              <span className={`font-heading font-semibold text-xs mt-1.5 text-center leading-tight ${isActive ? 'text-teal' : 'text-gray-700'}`}>
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="flex items-center gap-3 mt-4 mb-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="font-body text-xs text-gray-400 shrink-0">Agrega m&aacute;s a tu fiesta</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Extra categories — small pills */}
      <div className="flex flex-wrap gap-2">
        {extraCats.map((cat) => {
          const isActive = selected === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-heading font-semibold text-xs transition-all ${
                isActive
                  ? 'bg-purple text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{cat.icon}</span> {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { Category } from '@/lib/types';
import { useCategories } from '@/lib/useCategories';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';

interface CategoryFilterProps {
  selected: Category | 'all';
  onSelect: (category: Category | 'all') => void;
}

export default function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  const categories = useCategories();

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
      {categories.map((cat) => {
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
  );
}

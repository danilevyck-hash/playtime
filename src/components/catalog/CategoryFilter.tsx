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
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
      <div className="flex gap-2 w-max pb-1">
        {categories.map((cat) => {
          const Doodle = CATEGORY_DOODLES[cat.id];
          const isActive = selected === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border whitespace-nowrap shrink-0 ${
                isActive
                  ? 'border-teal bg-teal/5 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-teal/50'
              }`}
            >
              {Doodle ? <Doodle className="w-5 h-5" /> : <span className="text-base">{cat.icon}</span>}
              <span className={`font-heading font-semibold text-sm ${isActive ? 'text-teal' : 'text-gray-700'}`}>
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { Category } from '@/lib/types';
import { CATEGORIES } from '@/lib/constants';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';

interface CategoryFilterProps {
  selected: Category | 'all';
  onSelect: (category: Category | 'all') => void;
}

export default function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <button
        onClick={() => onSelect('all')}
        className={`shrink-0 px-4 py-2 rounded-full font-heading font-semibold text-sm transition-all focus:ring-2 focus:ring-purple focus:ring-offset-1 focus:outline-none ${
          selected === 'all'
            ? 'bg-teal text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Todos
      </button>
      {CATEGORIES.map((cat) => {
        const Doodle = CATEGORY_DOODLES[cat.id];
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`shrink-0 px-4 py-2 rounded-full font-heading font-semibold text-sm transition-all flex items-center gap-1.5 focus:ring-2 focus:ring-purple focus:ring-offset-1 focus:outline-none ${
              selected === cat.id
                ? 'bg-teal text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {Doodle ? <Doodle className="w-5 h-5" /> : cat.icon} {cat.label}
          </button>
        );
      })}
    </div>
  );
}

'use client';

import { Category } from '@/lib/types';
import { useCategories } from '@/lib/useCategories';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';

const MAIN_ORDER: Category[] = ['planes', 'spa', 'show', 'snacks', 'softplay', 'bounces'];
const EXTRA_ORDER: Category[] = ['ballpit', 'addons', 'creative'];

interface CategoryFilterProps {
  selected: Category | 'all';
  onSelect: (category: Category | 'all') => void;
}

function CategoryCard({ cat, isActive, onSelect }: { cat: { id: Category; label: string; icon: string }; isActive: boolean; onSelect: () => void }) {
  const Doodle = CATEGORY_DOODLES[cat.id];
  return (
    <button
      onClick={onSelect}
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

      {/* Main 6 categories */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {mainCats.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} isActive={selected === cat.id} onSelect={() => onSelect(cat.id)} />
        ))}
      </div>

      {/* Separator */}
      <div className="flex items-center gap-3 mt-4 mb-3">
        <div className="flex-1 h-px bg-gray-300" />
        <span className="font-heading font-semibold text-xs text-gray-500 shrink-0">{'✨'} Agrega m&aacute;s a tu fiesta</span>
        <div className="flex-1 h-px bg-gray-300" />
      </div>

      {/* Extra 3 categories — same card style, centered */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {extraCats.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} isActive={selected === cat.id} onSelect={() => onSelect(cat.id)} />
        ))}
      </div>
    </div>
  );
}

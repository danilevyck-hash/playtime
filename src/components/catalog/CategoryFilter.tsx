'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Category } from '@/lib/types';
import { useCategories } from '@/lib/useCategories';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';

interface CategoryFilterProps {
  selected: Category | 'all';
  onSelect: (category: Category | 'all') => void;
}

export default function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  const categories = useCategories();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowFade(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, categories.length]);

  return (
    <div className="relative -mx-4 px-4">
      <div ref={scrollRef} className="overflow-x-auto scrollbar-hide snap-x snap-mandatory">
        <div className="flex gap-2 w-max pb-1 pr-8">
          {categories.map((cat) => {
            const Doodle = CATEGORY_DOODLES[cat.id];
            const isActive = selected === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelect(cat.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full border whitespace-nowrap shrink-0 snap-start ${
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
      {showFade && (
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-beige to-transparent pointer-events-none" />
      )}
    </div>
  );
}

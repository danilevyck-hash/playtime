'use client';

import { useState, useEffect } from 'react';
import { CATEGORIES } from './constants';
import { fetchSetting } from './supabase-data';
import { Category } from './types';

interface CategoryItem {
  id: Category;
  label: string;
  shortLabel?: string;
  icon: string;
  description: string;
  subtitle?: string;
}

export function useCategories(): CategoryItem[] {
  const [categories, setCategories] = useState<CategoryItem[]>(CATEGORIES);

  useEffect(() => {
    async function load() {
      try {
        const [custom, savedOrder, overrides] = await Promise.all([
          fetchSetting<CategoryItem[]>('custom_categories'),
          fetchSetting<string[]>('category_order'),
          fetchSetting<Record<string, { name?: string; subtitle?: string; emoji?: string }>>('category_overrides'),
        ]);

        let cats = [...CATEGORIES] as CategoryItem[];

        if (custom && Array.isArray(custom) && custom.length > 0) {
          const ids = new Set(cats.map(c => c.id));
          const newOnes = custom.filter(c => !ids.has(c.id));
          cats = [...cats, ...newOnes];
        }

        if (overrides && typeof overrides === 'object') {
          cats = cats.map(c => {
            const o = overrides[c.id];
            if (!o) return c;
            return {
              ...c,
              ...(o.name ? { label: o.name } : {}),
              ...(o.emoji ? { icon: o.emoji } : {}),
              ...(o.subtitle !== undefined ? { subtitle: o.subtitle } : {}),
            };
          });
        }

        if (savedOrder && savedOrder.length > 0) {
          const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
          cats.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity));
        }

        setCategories(cats);
      } catch (e) {
        console.error('Error loading categories:', e);
      }
    }
    load();
  }, []);

  return categories;
}

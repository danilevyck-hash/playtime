'use client';

import { useState, useEffect } from 'react';
import { CATEGORIES } from './constants';
import { fetchSetting } from './supabase-data';
import { Category } from './types';

interface CategoryItem {
  id: Category;
  label: string;
  icon: string;
  description: string;
  subtitle?: string;
}

export function useCategories(): CategoryItem[] {
  const [categories, setCategories] = useState<CategoryItem[]>(CATEGORIES);

  useEffect(() => {
    async function load() {
      try {
        const [custom, savedOrder] = await Promise.all([
          fetchSetting<CategoryItem[]>('custom_categories'),
          fetchSetting<string[]>('category_order'),
        ]);

        let cats = [...CATEGORIES] as CategoryItem[];

        if (custom && Array.isArray(custom) && custom.length > 0) {
          const ids = new Set(cats.map(c => c.id));
          const newOnes = custom.filter(c => !ids.has(c.id));
          cats = [...cats, ...newOnes];
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

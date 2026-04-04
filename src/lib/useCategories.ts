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
    fetchSetting<CategoryItem[]>('custom_categories').then(custom => {
      if (custom && Array.isArray(custom) && custom.length > 0) {
        setCategories(prev => {
          const ids = new Set(prev.map(c => c.id));
          const newOnes = custom.filter(c => !ids.has(c.id));
          return [...prev, ...newOnes];
        });
      }
    }).catch((e) => console.error('Error loading custom categories:', e));
  }, []);

  return categories;
}

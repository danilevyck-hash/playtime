'use client';
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'playtime-favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setFavorites(new Set(JSON.parse(saved)));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(favorites)));
    }
  }, [favorites, hydrated]);

  const toggle = useCallback((productId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const isFavorite = useCallback((productId: string) => favorites.has(productId), [favorites]);

  return { favorites, toggle, isFavorite, count: favorites.size };
}

'use client';

import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { CartItem, Category } from '@/lib/types';
import { useToast } from '@/context/ToastContext';

interface CartState {
  items: CartItem[];
  hydrated: boolean;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: { productId: string; name: string; category: Category; unitPrice: number; quantity?: number } }
  | { type: 'REMOVE_ITEM'; payload: { productId: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'HYDRATE'; payload: CartItem[] };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.payload, hydrated: true };

    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.productId === action.payload.productId);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.productId === action.payload.productId
              ? { ...i, quantity: i.quantity + (action.payload.quantity || 1) }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            productId: action.payload.productId,
            name: action.payload.name,
            category: action.payload.category,
            unitPrice: action.payload.unitPrice,
            quantity: action.payload.quantity || 1,
          },
        ],
      };
    }

    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.productId !== action.payload.productId) };

    case 'UPDATE_QUANTITY': {
      if (action.payload.quantity <= 0) {
        return { ...state, items: state.items.filter((i) => i.productId !== action.payload.productId) };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.productId === action.payload.productId
            ? { ...i, quantity: action.payload.quantity }
            : i
        ),
      };
    }

    case 'CLEAR_CART':
      return { ...state, items: [] };

    default:
      return state;
  }
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (item: { productId: string; name: string; category: Category; unitPrice: number; quantity?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'playtime-cart';

function isValidCartItems(data: unknown): data is CartItem[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.productId === 'string' &&
      typeof item.name === 'string' &&
      typeof item.unitPrice === 'number' &&
      typeof item.quantity === 'number'
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [state, dispatch] = useReducer(cartReducer, { items: [], hydrated: false });

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        dispatch({ type: 'HYDRATE', payload: isValidCartItems(parsed) ? parsed : [] });
      } else {
        dispatch({ type: 'HYDRATE', payload: [] });
      }
    } catch {
      dispatch({ type: 'HYDRATE', payload: [] });
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (state.hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    }
  }, [state.items, state.hydrated]);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const value: CartContextValue = {
    items: state.items,
    itemCount,
    subtotal,
    addItem: (item) => { dispatch({ type: 'ADD_ITEM', payload: item }); showToast('\u2705 Agregado al carrito'); },
    removeItem: (productId) => dispatch({ type: 'REMOVE_ITEM', payload: { productId } }),
    updateQuantity: (productId, quantity) => dispatch({ type: 'UPDATE_QUANTITY', payload: { productId, quantity } }),
    clearCart: () => dispatch({ type: 'CLEAR_CART' }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}

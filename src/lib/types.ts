export type Category =
  | 'planes'
  | 'entretenimiento'
  | 'equipos'
  | 'decoracion'
  | 'comida'
  | 'servicios';

export interface Product {
  id: string;
  name: string;
  category: Category;
  description: string;
  price: number;
  image?: string;
  maxQuantity?: number;
  featured?: boolean;
}

export interface CartItem {
  productId: string;
  name: string;
  category: Category;
  unitPrice: number;
  quantity: number;
}

export interface OrderCustomer {
  name: string;
  phone: string;
  email: string;
}

export interface OrderEvent {
  date: string;
  time: string;
  address: string;
  birthdayChildName: string;
  birthdayChildAge: number | '';
  theme: string;
}

export type PaymentMethod = 'bank_transfer' | 'credit_card';

export interface Order {
  customer: OrderCustomer;
  event: OrderEvent;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  subtotal: number;
  surcharge: number;
  total: number;
  notes: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  planes: 'Planes',
  entretenimiento: 'Entretenimiento',
  equipos: 'Equipos',
  decoracion: 'Decoración',
  comida: 'Comida',
  servicios: 'Servicios',
};

export const CATEGORY_ICONS: Record<Category, string> = {
  planes: '🎉',
  entretenimiento: '🎭',
  equipos: '🎪',
  decoracion: '🎈',
  comida: '🍿',
  servicios: '🎵',
};

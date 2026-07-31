export type Category =
  | 'planes'
  | 'spa'
  | 'show'
  | 'snacks'
  | 'softplay'
  | 'bounces'

  | 'addons'
  | 'creative';

export interface ProductVariant {
  id: string;
  label: string;
  price?: number;
  image?: string;
  description?: string;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  description: string;
  price: number;
  image?: string;
  maxQuantity?: number;
  minQuantity?: number;
  quantityStep?: number;
  featured?: boolean;
  popular?: boolean;
  variants?: ProductVariant[];
  variantLabel?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  category: Category;
  unitPrice: number;
  quantity: number;
  image?: string;
  minQuantity?: number;
  quantityStep?: number;
}

export interface OrderCustomer {
  name: string;
  phone: string;
  email: string;
}

export interface OrderEvent {
  date: string;
  time: string;
  showTime?: string;
  area: string;
  address: string;
  birthdayChildName: string;
  birthdayChildAge: number | '';
  theme: string;
}

export const EVENT_AREAS: { name: string; price: number }[] = [
  { name: 'Ancón', price: 65 },
  { name: 'Bella Vista', price: 50 },
  { name: 'Chorrera', price: 90 },
  { name: 'Clayton', price: 60 },
  { name: 'Coco del Mar', price: 50 },
  { name: 'Costa del Este', price: 55 },
  { name: 'Las Cumbres', price: 75 },
  { name: 'Panamá Pacífico', price: 70 },
  { name: 'Paitilla', price: 50 },
  { name: 'Punta Pacífica', price: 50 },
  { name: 'San Francisco', price: 50 },
  { name: 'Santa María', price: 65 },
  { name: 'Vía Israel', price: 50 },
  { name: 'Villa Lucre', price: 70 },
  { name: 'Otra área', price: 0 },
];

export type PaymentMethod = 'bank_transfer' | 'credit_card';

/**
 * Los métodos de pago que el cliente puede elegir de verdad — son exactamente
 * los dos botones del checkout (OrderReview.tsx: 'bank_transfer' y
 * 'credit_card'). Vive acá para que la validación del API no pueda quedar
 * desfasada de lo que la pantalla ofrece.
 *
 * Exhaustivo por construcción: al ser un Record<PaymentMethod, …>, agregar un
 * método al tipo y olvidarse de listarlo acá NO compila.
 */
const PAYMENT_METHOD_SET: Record<PaymentMethod, true> = {
  bank_transfer: true,
  credit_card: true,
};

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_SET) as PaymentMethod[];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_SET, v);
}

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
  planes: 'Experiences',
  spa: 'Spa Experience',
  show: 'Show & Personajes',
  snacks: 'Snack Bar',
  softplay: 'Soft Play',
  bounces: 'Bounces',

  addons: 'Add-Ons',
  creative: 'Creative Studio',
};

export const CATEGORY_ICONS: Record<Category, string> = {
  planes: '\uD83C\uDF89',
  spa: '\uD83D\uDC85',
  show: '\uD83C\uDFAD',
  snacks: '\uD83C\uDF7F',
  softplay: '\uD83C\uDFF0',
  bounces: '\uD83C\uDFAA',

  addons: '\uD83C\uDF88',
  creative: '\uD83C\uDFA8',
};

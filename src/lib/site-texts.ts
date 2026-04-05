import { fetchSetting } from './supabase-data';

export interface SiteTexts {
  // Cart
  cart_title: string;
  cart_urgency: string;
  cart_transport_message: string;
  cart_cta_add_more: string;
  cart_cta_checkout: string;
  cart_empty_title: string;
  cart_empty_subtitle: string;
  cart_clear_label: string;

  // Checkout
  checkout_title: string;
  checkout_submit: string;
  checkout_loading: string;

  // General
  catalog_cta: string;
  whatsapp_fallback: string;
}

export const DEFAULT_SITE_TEXTS: SiteTexts = {
  cart_title: 'Tu fiesta en progreso 🎈',
  cart_urgency: '✅ Reserva tu fecha — la disponibilidad es limitada',
  cart_transport_message: '🚚 Los costos logísticos (transporte, montaje y desmontaje) se calcularán según la ubicación y se confirmarán en el siguiente paso.',
  cart_cta_add_more: 'Agregar más diversión',
  cart_cta_checkout: 'Continuar a reservar',
  cart_empty_title: '¡Tu fiesta te está esperando!',
  cart_empty_subtitle: 'Explora nuestros servicios y arma algo increíble 🎉',
  cart_clear_label: 'Empezar de nuevo',
  checkout_title: 'Confirma tu experiencia',
  checkout_submit: '¡Reservar mi fiesta! 🎈',
  checkout_loading: 'Preparando magia... ✨',
  catalog_cta: '¡Arma tu fiesta! 🎉',
  whatsapp_fallback: '¿No tienes WhatsApp?',
};

export const SITE_TEXT_LABELS: Record<keyof SiteTexts, string> = {
  cart_title: 'Título del carrito',
  cart_urgency: 'Banner de urgencia (carrito)',
  cart_transport_message: 'Mensaje de costos logísticos',
  cart_cta_add_more: 'Botón "Agregar más"',
  cart_cta_checkout: 'Botón de checkout',
  cart_empty_title: 'Carrito vacío — título',
  cart_empty_subtitle: 'Carrito vacío — subtítulo',
  cart_clear_label: 'Botón limpiar carrito',
  checkout_title: 'Título del checkout',
  checkout_submit: 'Botón reservar',
  checkout_loading: 'Texto de carga',
  catalog_cta: 'Botón CTA catálogo',
  whatsapp_fallback: 'Texto fallback WhatsApp',
};

let _cached: SiteTexts | null = null;
let _fetchPromise: Promise<SiteTexts> | null = null;

export async function getSiteTexts(): Promise<SiteTexts> {
  if (_cached) return _cached;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetchSetting<Partial<SiteTexts>>('site_texts')
    .then(data => {
      _cached = { ...DEFAULT_SITE_TEXTS, ...(data || {}) };
      return _cached;
    })
    .catch(() => {
      _cached = { ...DEFAULT_SITE_TEXTS };
      return _cached;
    })
    .finally(() => { _fetchPromise = null; });

  return _fetchPromise;
}

export function clearSiteTextsCache() {
  _cached = null;
}

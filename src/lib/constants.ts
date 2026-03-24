import { Product, Category } from './types';

export const BANK_INFO = {
  bank: 'Banco Aliado',
  name: 'Nathalie Levy',
  accountType: 'Cuenta Ahorros',
  accountNumber: '1040071392',
};

export const CREDIT_CARD_SURCHARGE = 0.05;

export const CATEGORIES: { id: Category; label: string; icon: string; description: string }[] = [
  { id: 'planes', label: 'Planes', icon: '🎉', description: 'Paquetes todo incluido para tu fiesta' },
  { id: 'entretenimiento', label: 'Entretenimiento', icon: '🎭', description: 'Animación, personajes y shows' },
  { id: 'equipos', label: 'Equipos', icon: '🎪', description: 'Trampolines, carritos chocones y más' },
  { id: 'decoracion', label: 'Decoración', icon: '🎈', description: 'Mesas temáticas y candy bars' },
  { id: 'comida', label: 'Comida', icon: '🍿', description: 'Palomitas, algodón de azúcar y más' },
  { id: 'servicios', label: 'Servicios', icon: '🎵', description: 'DJ, maestros extras y transporte' },
];

export const PRODUCTS: Product[] = [
  // ═══ PLANES ═══
  {
    id: 'plan-fiesta',
    name: 'Plan Fiesta',
    category: 'planes',
    description: 'Incluye 1 hora de animación con juegos y actividades dirigidas.',
    price: 106,
    featured: true,
  },
  {
    id: 'plan-basico',
    name: 'Plan Básico',
    category: 'planes',
    description: 'Animación + trampolín pequeño + caritas pintadas.',
    price: 195,
    featured: true,
  },
  {
    id: 'plan-intermedio',
    name: 'Plan Intermedio',
    category: 'planes',
    description: 'Animación + trampolín + show de títeres + caritas pintadas + globoflexia.',
    price: 375,
    featured: true,
  },
  {
    id: 'plan-premium',
    name: 'Plan Premium',
    category: 'planes',
    description: 'Todo del intermedio + personaje + algodón de azúcar + mesa de manualidades.',
    price: 465,
    featured: true,
  },
  {
    id: 'plan-deluxe',
    name: 'Plan Deluxe',
    category: 'planes',
    description: 'Todo del premium + mini roller coaster + palomitas + hot dogs.',
    price: 525,
  },
  {
    id: 'plan-vip',
    name: 'Plan VIP',
    category: 'planes',
    description: 'La experiencia completa: todos los servicios y equipos disponibles.',
    price: 700,
    featured: true,
  },

  // ═══ ENTRETENIMIENTO ═══
  {
    id: 'animacion',
    name: 'Animación',
    category: 'entretenimiento',
    description: '1 hora de animación con juegos, bailes y actividades dirigidas.',
    price: 75,
  },
  {
    id: 'animacion-2h',
    name: 'Animación 2 Horas',
    category: 'entretenimiento',
    description: '2 horas de animación con juegos, bailes y actividades dirigidas.',
    price: 140,
  },
  {
    id: 'personaje',
    name: 'Personaje Temático',
    category: 'entretenimiento',
    description: 'Personaje disfrazado del tema de tu preferencia.',
    price: 85,
  },
  {
    id: 'show-titeres-pequeno',
    name: 'Show de Títeres (Pequeño)',
    category: 'entretenimiento',
    description: 'Show de títeres interactivo con teatrín pequeño.',
    price: 175,
  },
  {
    id: 'show-titeres-grande',
    name: 'Show de Títeres (Grande)',
    category: 'entretenimiento',
    description: 'Show de títeres interactivo con teatrín grande y más personajes.',
    price: 250,
  },
  {
    id: 'caritas-pintadas',
    name: 'Caritas Pintadas',
    category: 'entretenimiento',
    description: 'Pintacaritas profesional con diseños variados.',
    price: 65,
  },
  {
    id: 'globoflexia',
    name: 'Globoflexia',
    category: 'entretenimiento',
    description: 'Figuras de globos personalizadas para cada niño.',
    price: 55,
  },
  {
    id: 'mesa-manualidades',
    name: 'Mesa de Manualidades',
    category: 'entretenimiento',
    description: 'Actividad creativa con materiales incluidos para todos los niños.',
    price: 75,
  },

  // ═══ EQUIPOS ═══
  {
    id: 'trampolin-pequeno',
    name: 'Trampolín Pequeño',
    category: 'equipos',
    description: 'Trampolín inflable ideal para espacios reducidos.',
    price: 85,
    featured: true,
  },
  {
    id: 'trampolin-grande',
    name: 'Trampolín Grande',
    category: 'equipos',
    description: 'Trampolín inflable grande con tobogán integrado.',
    price: 150,
  },
  {
    id: 'bumper-cars',
    name: 'Carritos Chocones',
    category: 'equipos',
    description: 'Set de carritos chocones eléctricos para niños.',
    price: 200,
    featured: true,
  },
  {
    id: 'mini-roller-coaster',
    name: 'Mini Roller Coaster',
    category: 'equipos',
    description: 'Mini montaña rusa portátil para niños.',
    price: 250,
  },
  {
    id: 'tobogan-inflable',
    name: 'Tobogán Inflable',
    category: 'equipos',
    description: 'Tobogán inflable de agua o seco.',
    price: 175,
  },
  {
    id: 'piscina-pelotas',
    name: 'Piscina de Pelotas',
    category: 'equipos',
    description: 'Piscina inflable llena de pelotas de colores.',
    price: 65,
  },

  // ═══ DECORACIÓN ═══
  {
    id: 'mesa-tematica',
    name: 'Mesa Temática',
    category: 'decoracion',
    description: 'Decoración completa de mesa principal con tema a elección.',
    price: 120,
  },
  {
    id: 'candy-bar',
    name: 'Candy Bar',
    category: 'decoracion',
    description: 'Mesa de dulces decorada con tema a elección.',
    price: 95,
  },
  {
    id: 'centros-mesa',
    name: 'Centros de Mesa (x10)',
    category: 'decoracion',
    description: 'Set de 10 centros de mesa temáticos.',
    price: 80,
  },
  {
    id: 'arco-globos',
    name: 'Arco de Globos',
    category: 'decoracion',
    description: 'Arco de globos orgánico con colores a elección.',
    price: 85,
  },
  {
    id: 'letras-led',
    name: 'Letras LED',
    category: 'decoracion',
    description: 'Letras o números gigantes con luces LED.',
    price: 45,
    maxQuantity: 10,
  },

  // ═══ COMIDA ═══
  {
    id: 'palomitas',
    name: 'Palomitas de Maíz',
    category: 'comida',
    description: 'Máquina de palomitas con servicio durante el evento.',
    price: 55,
  },
  {
    id: 'algodon-azucar',
    name: 'Algodón de Azúcar',
    category: 'comida',
    description: 'Máquina de algodón de azúcar con servicio durante el evento.',
    price: 55,
  },
  {
    id: 'hot-dogs',
    name: 'Hot Dogs (x30)',
    category: 'comida',
    description: 'Carrito de hot dogs con 30 unidades incluidas.',
    price: 75,
  },
  {
    id: 'raspados',
    name: 'Raspados',
    category: 'comida',
    description: 'Máquina de raspados con jarabes variados.',
    price: 65,
  },

  // ═══ SERVICIOS ═══
  {
    id: 'dj-musica',
    name: 'DJ / Música',
    category: 'servicios',
    description: 'Equipo de sonido profesional con DJ durante todo el evento.',
    price: 150,
  },
  {
    id: 'maestro-extra',
    name: 'Maestro Extra',
    category: 'servicios',
    description: 'Animador adicional para apoyar en las actividades.',
    price: 50,
    maxQuantity: 5,
  },
  {
    id: 'transporte',
    name: 'Transporte',
    category: 'servicios',
    description: 'Transporte de equipos fuera del área metropolitana.',
    price: 35,
  },
  {
    id: 'hora-extra',
    name: 'Hora Extra de Servicio',
    category: 'servicios',
    description: 'Extensión de 1 hora adicional de cualquier servicio.',
    price: 60,
    maxQuantity: 3,
  },
];

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Preguntas Frecuentes',
  description: 'Encuentra respuestas a las preguntas más comunes sobre nuestros servicios de fiestas infantiles en Panamá.',
};

export default function PreguntasLayout({ children }: { children: React.ReactNode }) {
  return children;
}

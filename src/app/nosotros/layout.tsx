import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nosotros',
  description: 'Conoce al equipo detrás de PlayTime Panamá. Más de 600 eventos creando momentos inolvidables para familias panameñas.',
};

export default function NosotrosLayout({ children }: { children: React.ReactNode }) {
  return children;
}

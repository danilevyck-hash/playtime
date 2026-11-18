'use client';

// La app INSTALADA abre en «/» (start_url del manifest, compartido con los
// clientes). Si en ese teléfono hay sesión del equipo, va directo a lo suyo:
// Dirección y Gerencia al admin, colaboradores a Marcar. Solo en modo
// instalado: en Safari normal la portada sigue siendo la portada.
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { casaDe, leerSesion } from '@/lib/sesion-local';

export default function SesionRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname !== '/') return;
    const instalada = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!instalada) return;
    const s = leerSesion();
    if (s) router.replace(casaDe(s.role));
  }, [pathname, router]);
  return null;
}

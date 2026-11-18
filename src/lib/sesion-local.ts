// La sesión que RECUERDA el teléfono (Daniel, 18-nov-2026: «como fashiongr,
// no poner el PIN cada vez»). Es el mismo token HMAC de siempre, guardado en
// localStorage para que sobreviva al cierre de la app instalada. Vence a los
// 14 días sin usarla: cada vez que se abre, GET /api/auth lo renueva. «Cerrar
// sesión» lo borra. La marcación sigue pidiendo foto y ubicación en cada marca.
import type { Rol } from '@/lib/roles';

const KEY_TOKEN = 'ptSesionToken';
const KEY_ROL = 'ptSesionRol';
const ROLES: Rol[] = ['admin', 'vendedora', 'colaborador'];

export interface SesionLocal {
  token: string;
  role: Rol;
}

export function leerSesion(): SesionLocal | null {
  try {
    const token = localStorage.getItem(KEY_TOKEN);
    const role = localStorage.getItem(KEY_ROL) as Rol | null;
    return token && role && ROLES.includes(role) ? { token, role } : null;
  } catch {
    return null;
  }
}

export function guardarSesion(token: string, role: Rol): void {
  try {
    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_ROL, role);
  } catch {}
}

export function cerrarSesion(): void {
  try {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_ROL);
  } catch {}
}

/** A dónde va cada rol al abrir la app. */
export const casaDe = (role: Rol): string => (role === 'colaborador' ? '/marcar' : '/admin');

/**
 * Pide al servidor un token nuevo (otros 14 días). Vencido o revocado → borra
 * la sesión y devuelve null. Sin red → devuelve la guardada, para no sacar a
 * nadie por un bache de señal.
 */
export async function renovarSesion(): Promise<SesionLocal | null> {
  const s = leerSesion();
  if (!s) return null;
  try {
    const res = await fetch('/api/auth', { headers: { 'x-admin-token': s.token } });
    if (res.status === 401) {
      cerrarSesion();
      return null;
    }
    if (!res.ok) return s;
    const data = await res.json();
    if (data.ok && data.token && data.role) {
      guardarSesion(data.token, data.role);
      return { token: data.token, role: data.role };
    }
    return s;
  } catch {
    return s;
  }
}

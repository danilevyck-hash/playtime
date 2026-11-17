// Los tres roles del sistema. Los VALORES no cambian (viven en tokens y en
// sessionStorage); lo que ve la gente es el NOMBRE de ERP.
export type Rol = 'admin' | 'vendedora' | 'colaborador';

export const ROL_NOMBRE: Record<Rol, string> = {
  admin: 'Dirección', // la dueña: ve todo, la única con planilla y marcaciones
  vendedora: 'Gerencia', // catálogo, pedidos y sitio; sin planilla ni contabilidad
  colaborador: 'Colaborador', // los de bodega: solo /marcar, con su PIN personal
};

/** Los que entran al /admin (la planilla y la contabilidad filtran aparte a solo `admin`). */
export const ROLES_ADMIN: Rol[] = ['admin', 'vendedora'];

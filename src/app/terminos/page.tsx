import type { Metadata } from 'next';
import Link from 'next/link';
import { BANK_INFO } from '@/lib/constants';
import { fetchSetting } from '@/lib/supabase-data';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | PlayTime',
  description: 'Términos y condiciones del servicio de PlayTime: reservas, entregas, cancelaciones, métodos de pago y más.',
};

export const dynamic = 'force-dynamic';

export interface TermSection {
  icon: string;
  title: string;
  text: string;
}

const DEFAULT_TERMS: TermSection[] = [
  {
    icon: '\uD83D\uDCC5',
    title: 'Reserva',
    text: 'Para asegurar la fecha, se requiere un abono del 50% de la factura.',
  },
  {
    icon: '\uD83D\uDE9B',
    title: 'Entrega y recogida',
    text: 'Fines de semana: montamos el viernes, recogemos el lunes.\nEntre semana: montamos el día del evento, recogemos al día siguiente.\nEl espacio debe estar limpio y sin muebles al momento de la instalación.',
  },
  {
    icon: '\u23F0',
    title: 'Duración del servicio',
    text: 'El alquiler del equipo incluye 3 horas a partir de la hora indicada. Después de ese tiempo, el personal se retira. Se puede extender con costo adicional por hora.',
  },
  {
    icon: '\uD83C\uDFB5',
    title: 'Servicios adicionales',
    text: 'Música durante todo el evento y animación de piñata están disponibles como servicios adicionales. Consulta precios.',
  },
  {
    icon: '\uD83D\uDCCB',
    title: 'Cambios y cancelaciones',
    text: 'Cambios de fecha o cancelaciones deben realizarse con mínimo 48 horas de anticipación. Después de ese plazo se cobra una penalidad de $50.',
  },
  {
    icon: '\u26A0\uFE0F',
    title: 'No reembolsable',
    text: 'Una vez el material sea transportado o instalado, no se realizan reembolsos por lluvia, fallas eléctricas o falta de espacio.',
  },
  {
    icon: '\uD83D\uDCB3',
    title: 'Métodos de pago',
    text: `Transferencia bancaria: ${BANK_INFO.bank} · ${BANK_INFO.name} · ${BANK_INFO.accountType} · ${BANK_INFO.accountNumber}\nTarjeta de crédito: disponible con recargo del 5%`,
  },
];

export default async function TerminosPage() {
  const dbTerms = await fetchSetting<TermSection[]>('terms_conditions');
  const sections = dbTerms && dbTerms.length > 0 ? dbTerms : DEFAULT_TERMS;

  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12 md:py-20">
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-purple text-center mb-2">
          Términos y Condiciones
        </h1>
        <p className="text-center text-sm text-gray-500 mb-10">
          Información importante sobre nuestro servicio
        </p>

        <div className="space-y-4">
          {sections.map((section, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">{section.icon}</span>
                <div className="flex-1">
                  <h2 className="font-heading font-bold text-base text-gray-800 mb-2">{section.title}</h2>
                  <div className="font-body text-sm text-gray-600 leading-relaxed space-y-1.5">
                    {section.text.split('\n').map((line, j) => (
                      <p key={j}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <p className="text-sm text-gray-500 mb-4">{'\u00BF'}Tienes alguna duda?</p>
          <Link
            href="/preguntas"
            className="inline-flex items-center gap-2 text-purple font-heading font-semibold text-sm hover:underline"
          >
            Ver preguntas frecuentes
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

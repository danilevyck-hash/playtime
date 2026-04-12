import type { Metadata } from 'next';
import Link from 'next/link';
import { BANK_INFO } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | PlayTime',
  description: 'Términos y condiciones del servicio de PlayTime: reservas, entregas, cancelaciones, métodos de pago y más.',
};

const SECTIONS = [
  {
    icon: '\uD83D\uDCC5',
    title: 'Reserva',
    content: 'Para asegurar la fecha, se requiere un abono del 50% de la factura.',
  },
  {
    icon: '\uD83D\uDE9B',
    title: 'Entrega y recogida',
    items: [
      'Fines de semana: montamos el viernes, recogemos el lunes.',
      'Entre semana: montamos el día del evento, recogemos al día siguiente.',
      'El espacio debe estar limpio y sin muebles al momento de la instalación.',
    ],
  },
  {
    icon: '\u23F0',
    title: 'Duración del servicio',
    content: 'El alquiler del equipo incluye 3 horas a partir de la hora indicada. Después de ese tiempo, el personal se retira. Se puede extender con costo adicional por hora.',
  },
  {
    icon: '\uD83C\uDFB5',
    title: 'Servicios adicionales',
    content: 'Música durante todo el evento y animación de piñata están disponibles como servicios adicionales. Consulta precios.',
  },
  {
    icon: '\uD83D\uDCCB',
    title: 'Cambios y cancelaciones',
    content: 'Cambios de fecha o cancelaciones deben realizarse con mínimo 48 horas de anticipación. Después de ese plazo se cobra una penalidad de $50.',
  },
  {
    icon: '\u26A0\uFE0F',
    title: 'No reembolsable',
    content: 'Una vez el material sea transportado o instalado, no se realizan reembolsos por lluvia, fallas eléctricas o falta de espacio.',
  },
  {
    icon: '\uD83D\uDCB3',
    title: 'Métodos de pago',
    items: [
      `Transferencia bancaria: ${BANK_INFO.bank} \u00b7 ${BANK_INFO.name} \u00b7 ${BANK_INFO.accountType} \u00b7 ${BANK_INFO.accountNumber}`,
      'Tarjeta de crédito: disponible con recargo del 5%',
    ],
  },
];

export default function TerminosPage() {
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
          {SECTIONS.map((section, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">{section.icon}</span>
                <div className="flex-1">
                  <h2 className="font-heading font-bold text-base text-gray-800 mb-2">{section.title}</h2>
                  {section.content && (
                    <p className="font-body text-sm text-gray-600 leading-relaxed">{section.content}</p>
                  )}
                  {section.items && (
                    <ul className="space-y-1.5">
                      {section.items.map((item, j) => (
                        <li key={j} className="font-body text-sm text-gray-600 leading-relaxed flex items-start gap-2">
                          <span className="text-purple mt-1 flex-shrink-0">&bull;</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
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

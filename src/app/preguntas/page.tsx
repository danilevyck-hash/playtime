'use client';

import { useState } from 'react';

const FAQ_ITEMS = [
  {
    q: '¿Cómo funciona el servicio?',
    a: 'Es muy sencillo: exploras nuestro catálogo, eliges los servicios que más te gusten y nos escribes por WhatsApp para coordinar tu evento. Nosotros nos encargamos de llevar todo, montarlo y recogerlo. Tú solo disfrutas.',
  },
  {
    q: '¿Con cuánto tiempo de anticipación debo reservar?',
    a: 'Recomendamos reservar con al menos 1 a 2 semanas de anticipación para garantizar disponibilidad, especialmente en fines de semana. Para fechas populares (diciembre, carnavales, verano), te sugerimos reservar con un mes de anticipación.',
  },
  {
    q: '¿Cuál es el depósito para reservar?',
    a: 'Para asegurar tu fecha, solicitamos un depósito del 50% del total. El saldo restante se paga antes del evento. Aceptamos transferencia bancaria y tarjeta de crédito (con un recargo del 5%).',
  },
  {
    q: '¿Qué incluye cada paquete?',
    a: 'Cada paquete incluye el transporte, montaje y desmontaje del equipo, y la supervisión durante el evento. Los detalles específicos varían según el servicio. Puedes ver exactamente qué incluye cada opción en nuestro catálogo.',
  },
  {
    q: '¿Cubren mi zona? ¿Cuánto cuesta el transporte?',
    a: 'Cubrimos toda la Ciudad de Panamá y áreas cercanas. El costo de transporte varía según la ubicación y se calcula automáticamente al hacer tu pedido. Zonas como Costa del Este, Bella Vista y San Francisco tienen tarifas preferenciales.',
  },
  {
    q: '¿Qué pasa si llueve o necesito cancelar?',
    a: 'Si llueve, puedes reprogramar tu evento sin costo adicional con al menos 24 horas de aviso. En caso de cancelación con más de 48 horas de anticipación, devolvemos el 100% del depósito. Con menos de 48 horas, el depósito se mantiene como crédito para una fecha futura.',
  },
  {
    q: '¿Para qué edades son los servicios?',
    a: 'Nuestros servicios están diseñados para niños de 1 a 12 años principalmente. Tenemos opciones para todas las edades: desde piscinas de bolas para los más pequeñitos hasta bounces y shows para los más grandes. ¡También tenemos opciones para teens y adultos!',
  },
  {
    q: '¿Puedo personalizar mi paquete?',
    a: '¡Por supuesto! Puedes armar tu paquete a medida combinando cualquier servicio de nuestro catálogo. Si necesitas algo especial que no ves en el catálogo, escríbenos y lo coordinamos.',
  },
  {
    q: '¿Aceptan tarjeta de crédito?',
    a: 'Sí, aceptamos transferencia bancaria y tarjeta de crédito. El pago con tarjeta tiene un recargo del 5%. Al momento de hacer tu pedido, puedes elegir tu método de pago preferido.',
  },
  {
    q: '¿Cuánto dura la actividad?',
    a: 'La duración estándar es de 3 a 4 horas, que es lo ideal para una fiesta infantil. Si necesitas más tiempo, podemos coordinar una extensión con un costo adicional. Llegamos aproximadamente 1 hora antes para el montaje.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 px-1 text-left gap-4 active:bg-gray-50 transition-colors"
      >
        <span className="font-heading font-bold text-[15px] md:text-base text-gray-800">{q}</span>
        <svg
          className={`w-5 h-5 text-purple flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-96 pb-5' : 'max-h-0'}`}
      >
        <p className="text-sm text-gray-600 leading-relaxed px-1">{a}</p>
      </div>
    </div>
  );
}

export default function PreguntasPage() {
  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12 md:py-20">
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-purple text-center mb-2">
          Preguntas Frecuentes
        </h1>
        <p className="text-center text-sm text-gray-500 mb-10">
          Todo lo que necesitas saber antes de reservar
        </p>

        <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6">
          {FAQ_ITEMS.map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>

        <div className="text-center mt-10">
          <p className="text-sm text-gray-500 mb-4">¿No encontraste lo que buscabas?</p>
          <a
            href="https://wa.me/50764332724"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25D366] text-white font-heading font-semibold px-6 py-3 rounded-full text-sm hover:bg-[#20bd5a] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Escríbenos por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

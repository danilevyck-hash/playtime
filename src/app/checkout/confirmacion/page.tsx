import Link from 'next/link';
import Button from '@/components/ui/Button';
import ConfettiBackground from '@/components/ui/ConfettiBackground';

export default function ConfirmacionPage() {
  return (
    <ConfettiBackground className="bg-beige min-h-[70vh]">
      <div className="max-w-2xl mx-auto px-4 py-16 md:py-24 text-center">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-4">
          ¡Pedido Enviado!
        </h1>
        <p className="font-body text-lg text-gray-600 mb-2 max-w-md mx-auto">
          Tu pedido ha sido enviado por WhatsApp. Nos pondremos en contacto contigo pronto para confirmar los detalles.
        </p>
        <p className="font-body text-sm text-gray-400 mb-8">
          Si elegiste transferencia bancaria, recuerda enviar el comprobante de pago.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/">
            <Button variant="outline">Volver al Inicio</Button>
          </Link>
          <a href="https://wa.me/50764332724" target="_blank" rel="noopener noreferrer">
            <Button>
              Contactar por WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </ConfettiBackground>
  );
}

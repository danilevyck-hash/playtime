const TESTIMONIALS = [
  {
    name: 'Marianela Rodr\u00edguez',
    text: 'Contrat\u00e9 el Plan #1 para el cumple de mi hija de 5 a\u00f1os y fue un \u00e9xito total. Las teachers fueron incre\u00edbles y los ni\u00f1os no pararon de re\u00edr. \u00a1Ya reserv\u00e9 para el a\u00f1o que viene!',
    avatar: '\uD83D\uDC69\u200D\uD83E\uDDB1',
    color: 'border-l-teal',
  },
  {
    name: 'Sof\u00eda Arosemena',
    text: 'Ped\u00ed el gymboree y la m\u00e1quina de algod\u00f3n para el cumplea\u00f1os en mi casa. Llegaron puntuales, montaron todo r\u00e1pido y los ni\u00f1os estaban felices. El desmontaje tambi\u00e9n fue s\u00faper eficiente.',
    avatar: '\uD83D\uDC69\u200D\uD83E\uDDB0',
    color: 'border-l-orange',
  },
  {
    name: 'Patricia \u00c1brego',
    text: 'Lo que m\u00e1s me gust\u00f3 fue que me armaron un paquete a la medida. No tuve que preocuparme por nada, ellos trajeron todo hasta el sal\u00f3n. Mis amigas me pidieron el contacto.',
    avatar: '\uD83D\uDC71\u200D\u2640\uFE0F',
    color: 'border-l-pink',
  },
  {
    name: 'Carmen Vergara',
    text: 'Ya es la segunda vez que los contrato. El show de t\u00edteres es espectacular, los ni\u00f1os quedaron hipnotizados. Adem\u00e1s el PDF con el resumen del pedido me pareci\u00f3 muy profesional.',
    avatar: '\uD83D\uDC69',
    color: 'border-l-purple',
  },
];

export default function Testimonials() {
  return (
    <section className="bg-cream py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-3">
            Lo que dicen las mam&aacute;s
          </h2>
          <p className="font-body text-gray-500 max-w-md mx-auto">
            M&aacute;s de 200 familias felices en Panam&aacute;
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 border-l-4 ${t.color}`}
            >
              <div className="flex gap-1 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-yellow" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <p className="font-body text-gray-600 leading-relaxed mb-4">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{t.avatar}</span>
                <span className="font-heading font-bold text-sm text-gray-800">{t.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

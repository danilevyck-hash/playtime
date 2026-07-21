'use client';

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/format";
import { EVENT_AREAS } from "@/lib/types";
import { useToast } from "@/context/ToastContext";
import { fetchSetting, fetchDBProducts, DBProduct } from "@/lib/supabase-data";
import { DEFAULT_SITE_TEXTS, SITE_TEXT_LABELS, SiteTexts, clearSiteTextsCache } from "@/lib/site-texts";
import { WI_CLS, apiUpsertSetting, revalidateSite, _adminToken } from "./shared";

export default function WebsiteTab() {
  const { showToast } = useToast();
  const [section, setSection] = useState<'homepage' | 'featured' | 'areas' | 'logo' | 'faq'>('homepage');
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([]);

  useEffect(() => { fetchDBProducts().then(setDbProducts).catch(() => {}); }, []);

  // ─── A) HOMEPAGE ───
  const [hp, setHp] = useState({
    hero_title: '', hero_subtitle: '', hero_cta_primary: '', social_proof_text: '',
    services_title: '', services_subtitle: '', featured_title: '', featured_subtitle: '',
    cta_section_title: '', cta_section_subtitle: '',
  });
  const [hpLoaded, setHpLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<typeof hp>('homepage_content').then(d => {
      if (d) setHp(prev => ({ ...prev, ...d }));
      setHpLoaded(true);
    }).catch((e) => { console.error('Load homepage error:', e); setHpLoaded(true); });
  }, []);

  const saveHomepage = async () => {
    setSavingSection('homepage');
    try {
      const ok = await apiUpsertSetting('homepage_content', hp);
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('Homepage guardado');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── B) FEATURED ───
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [featLoaded, setFeatLoaded] = useState(false);
  const [cartSuggestIds, setCartSuggestIds] = useState<string[]>([]);
  const [checkoutSuggestIds, setCheckoutSuggestIds] = useState<string[]>([]);

  useEffect(() => {
    fetchSetting<string[]>('featured_products').then(d => {
      if (d) setFeaturedIds(d);
      setFeatLoaded(true);
    }).catch((e) => { console.error('Load featured error:', e); setFeatLoaded(true); });
    fetchSetting<string[]>('cart_suggestions').then(d => {
      if (Array.isArray(d)) setCartSuggestIds(d);
    }).catch((e) => console.error('Load cart suggestions error:', e));
    fetchSetting<string[]>('checkout_suggestions').then(d => {
      if (Array.isArray(d)) setCheckoutSuggestIds(d);
    }).catch((e) => console.error('Load checkout suggestions error:', e));
  }, []);

  const toggleFeatured = (id: string) => {
    setFeaturedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev);
  };

  const toggleCartSuggest = (id: string) => {
    setCartSuggestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev);
  };

  const toggleCheckoutSuggest = (id: string) => {
    setCheckoutSuggestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev);
  };

  const saveFeatured = async () => {
    setSavingSection('featured');
    try {
      const ok = (await apiUpsertSetting('featured_products', featuredIds))
        && (await apiUpsertSetting('cart_suggestions', cartSuggestIds))
        && (await apiUpsertSetting('checkout_suggestions', checkoutSuggestIds));
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('Productos destacados guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── C) AREAS ───
  const [areas, setAreas] = useState<{ name: string; price: number }[]>([]);
  const [areasLoaded, setAreasLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<{ name: string; price: number }[]>('event_areas').then(d => {
      setAreas(d && d.length > 0 ? d : [...EVENT_AREAS]);
      setAreasLoaded(true);
    }).catch((e) => { console.error('Load areas error:', e); setAreas([...EVENT_AREAS]); setAreasLoaded(true); });
  }, []);

  const saveAreas = async () => {
    setSavingSection('areas');
    try {
      const clean = areas.filter(a => a.name.trim());
      const ok = await apiUpsertSetting('event_areas', clean);
      if (!ok) { showToast('Error al guardar'); return; }
      setAreas(clean);
      revalidateSite();
      showToast('\u00c1reas guardadas');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── CONTACT INFO ───
  const [contactInfo, setContactInfo] = useState({
    whatsapp: '50764332724',
    phone: '(+507) 6433-2724',
    email: 'playtimekidspty@gmail.com',
    instagram: '@playtimekids',
    bank_name: 'Banco Aliado',
    bank_holder: 'Nathalie Levy',
    bank_account_type: 'Cuenta Ahorros',
    bank_account_number: '1040071392',
  });
  const [contactLoaded, setContactLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<typeof contactInfo>('contact_info').then(d => {
      if (d) setContactInfo(prev => ({ ...prev, ...d }));
      setContactLoaded(true);
    }).catch(() => setContactLoaded(true));
  }, []);

  const saveContact = async () => {
    setSavingSection('contact');
    try {
      const ok = await apiUpsertSetting('contact_info', contactInfo);
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('Contacto guardado');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── E) LOGO ───
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    fetchSetting<string>('site_logo_url').then(u => { if (u) setLogoUrl(u); }).catch((e) => console.error('Load logo error:', e));
  }, []);

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { showToast('Foto muy grande. M\u00e1ximo 2MB'); return; }
    if (!file.type.startsWith('image/')) { showToast('Solo se permiten im\u00e1genes'); return; }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', 'site-logo');
      formData.append('folder', 'logos');
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = data.path + '?t=' + Date.now();
        const okSet = await apiUpsertSetting('site_logo_url', url);
        if (!okSet) { showToast('Logo subido pero no se guard\u00f3 en la base de datos'); return; }
        setLogoUrl(url);
        revalidateSite();
        showToast('Logo actualizado');
      } else {
        const errBody = await res.json().catch(() => null);
        showToast(errBody?.error || (res.status === 401 ? 'Sesi\u00f3n expirada \u2014 recarga la p\u00e1gina' : 'Error al subir logo'));
      }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setLogoUploading(false); }
  };

  const resetLogo = async () => {
    const ok = await apiUpsertSetting('site_logo_url', null);
    if (!ok) { showToast('Error al restaurar el logo'); return; }
    setLogoUrl(null);
    revalidateSite();
    showToast('Logo tipogr\u00e1fico restaurado');
  };

  // ─── F) TESTIMONIALS ───
  const [testimonials, setTestimonials] = useState<Array<{ name: string; text: string; avatar: string }>>([]);
  const [testimonialsLoaded, setTestimonialsLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<Array<{ name: string; text: string; avatar: string }>>('testimonials').then(d => {
      if (d && d.length > 0) {
        setTestimonials(d);
      } else {
        setTestimonials([
          { name: 'Marianela Rodr\u00edguez', text: 'Contrat\u00e9 el Plan #1 para el cumple de mi hija de 5 a\u00f1os y fue un \u00e9xito total. Las teachers fueron incre\u00edbles y los ni\u00f1os no pararon de re\u00edr.', avatar: '\uD83D\uDC69\u200D\uD83E\uDDB1' },
          { name: 'Sof\u00eda Arosemena', text: 'Ped\u00ed el gymboree y la m\u00e1quina de algod\u00f3n. Llegaron puntuales, montaron todo r\u00e1pido y los ni\u00f1os estaban felices.', avatar: '\uD83D\uDC69\u200D\uD83E\uDDB0' },
          { name: 'Patricia \u00c1brego', text: 'Me armaron un paquete a la medida. No tuve que preocuparme por nada, ellos trajeron todo hasta el sal\u00f3n.', avatar: '\uD83D\uDC71\u200D\u2640\uFE0F' },
          { name: 'Carmen Vergara', text: 'Ya es la segunda vez que los contrato. El show de t\u00edteres es espectacular, los ni\u00f1os quedaron hipnotizados.', avatar: '\uD83D\uDC69' },
        ]);
      }
      setTestimonialsLoaded(true);
    }).catch((e) => { console.error('Load testimonials error:', e); setTestimonialsLoaded(true); });
  }, []);

  const saveTestimonials = async () => {
    setSavingSection('testimonials');
    try {
      const clean = testimonials.filter(t => t.name.trim() && t.text.trim());
      const ok = await apiUpsertSetting('testimonials', clean);
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('Testimonios guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── G-bis) TERMS & CONDITIONS ───
  const [terms, setTerms] = useState<Array<{ icon: string; title: string; text: string }>>([]);
  const [termsLoaded, setTermsLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<Array<{ icon: string; title: string; text: string }>>('terms_conditions').then(d => {
      if (d && d.length > 0) {
        setTerms(d);
      } else {
        setTerms([
          { icon: '\uD83D\uDCC5', title: 'Reserva', text: 'Para asegurar la fecha, se requiere un abono del 50% de la factura.' },
          { icon: '\uD83D\uDE9B', title: 'Entrega y recogida', text: 'Fines de semana: montamos el viernes, recogemos el lunes.\nEntre semana: montamos el d\u00eda del evento, recogemos al d\u00eda siguiente.\nEl espacio debe estar limpio y sin muebles al momento de la instalaci\u00f3n.' },
          { icon: '\u23F0', title: 'Duraci\u00f3n del servicio', text: 'El alquiler del equipo incluye 3 horas a partir de la hora indicada. Despu\u00e9s de ese tiempo, el personal se retira. Se puede extender con costo adicional por hora.' },
          { icon: '\uD83C\uDFB5', title: 'Servicios adicionales', text: 'M\u00fasica durante todo el evento y animaci\u00f3n de pi\u00f1ata est\u00e1n disponibles como servicios adicionales. Consulta precios.' },
          { icon: '\uD83D\uDCCB', title: 'Cambios y cancelaciones', text: 'Cambios de fecha o cancelaciones deben realizarse con m\u00ednimo 48 horas de anticipaci\u00f3n. Despu\u00e9s de ese plazo se cobra una penalidad de $50.' },
          { icon: '\u26A0\uFE0F', title: 'No reembolsable', text: 'Una vez el material sea transportado o instalado, no se realizan reembolsos por lluvia, fallas el\u00e9ctricas o falta de espacio.' },
          { icon: '\uD83D\uDCB3', title: 'M\u00e9todos de pago', text: 'Transferencia bancaria: Banco Aliado \u00b7 Nathalie Levy \u00b7 Cuenta Ahorros \u00b7 1040071392\nTarjeta de cr\u00e9dito: disponible con recargo del 5%' },
        ]);
      }
      setTermsLoaded(true);
    }).catch((e) => { console.error('Load terms error:', e); setTermsLoaded(true); });
  }, []);

  const saveTerms = async () => {
    setSavingSection('terms');
    try {
      const clean = terms.filter(t => t.title.trim() && t.text.trim());
      const ok = await apiUpsertSetting('terms_conditions', clean);
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('T\u00e9rminos guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── G) SITE TEXTS ───
  const [siteTexts, setSiteTexts] = useState<SiteTexts>({ ...DEFAULT_SITE_TEXTS });
  const [siteTextsLoaded, setSiteTextsLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<Partial<SiteTexts>>('site_texts').then(d => {
      if (d) setSiteTexts(prev => ({ ...prev, ...d }));
      setSiteTextsLoaded(true);
    }).catch((e) => { console.error('Load site texts error:', e); setSiteTextsLoaded(true); });
  }, []);

  const saveSiteTexts = async () => {
    setSavingSection('textos');
    try {
      // Only save non-default values
      const overrides: Partial<SiteTexts> = {};
      for (const key of Object.keys(siteTexts) as (keyof SiteTexts)[]) {
        if (siteTexts[key] && siteTexts[key] !== DEFAULT_SITE_TEXTS[key]) {
          overrides[key] = siteTexts[key];
        }
      }
      const ok = await apiUpsertSetting('site_texts', overrides);
      if (!ok) { showToast('Error al guardar'); return; }
      clearSiteTextsCache();
      revalidateSite();
      showToast('Textos guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── ABOUT ───
  const [aboutIntro, setAboutIntro] = useState('Somos un equipo apasionado por crear momentos inolvidables para los m\u00e1s peque\u00f1os. Desde 2015, hemos llevado alegr\u00eda a m\u00e1s de 600 eventos en Panam\u00e1, combinando creatividad, calidad y atenci\u00f3n al detalle en cada fiesta.');
  const [aboutStats, setAboutStats] = useState([
    { value: '+600', label: 'Eventos realizados' },
    { value: '+400', label: 'Familias felices' },
    { value: '8', label: 'Servicios disponibles' },
  ]);
  const [aboutLoaded, setAboutLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchSetting<string>('about_intro'),
      fetchSetting<{ value: string; label: string }[]>('about_stats'),
    ]).then(([intro, stats]) => {
      if (intro && typeof intro === 'string') setAboutIntro(intro);
      if (Array.isArray(stats) && stats.length > 0) setAboutStats(stats);
      setAboutLoaded(true);
    }).catch(() => setAboutLoaded(true));
  }, []);

  const saveAbout = async () => {
    setSavingSection('about');
    try {
      await apiUpsertSetting('about_intro', aboutIntro);
      await apiUpsertSetting('about_stats', aboutStats);
      revalidateSite();
      showToast('Nosotros guardado');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── FAQ ───
  const [faqItems, setFaqItems] = useState<{ q: string; a: string }[]>([]);
  const [faqLoaded, setFaqLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<{ q: string; a: string }[]>('faq_items').then(d => {
      if (Array.isArray(d) && d.length > 0) setFaqItems(d);
      else setFaqItems([
        { q: '\u00bfC\u00f3mo funciona el servicio?', a: 'Es muy sencillo: exploras nuestro cat\u00e1logo, eliges los servicios que m\u00e1s te gusten y nos escribes por WhatsApp para coordinar tu evento.' },
      ]);
      setFaqLoaded(true);
    }).catch(() => setFaqLoaded(true));
  }, []);

  const saveFaq = async () => {
    setSavingSection('faq');
    try {
      const clean = faqItems.filter(f => f.q.trim() && f.a.trim());
      await apiUpsertSetting('faq_items', clean);
      revalidateSite();
      showToast('FAQ guardadas');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  const SUB_TABS: { key: typeof section; label: string }[] = [
    { key: 'homepage', label: 'Textos' },
    { key: 'logo', label: 'Logo & Media' },
    { key: 'featured', label: 'Destacados' },
    { key: 'faq', label: 'FAQ' },
    { key: 'areas', label: 'Config' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-xl text-purple">Sitio Web</h2>

      {/* Sub-tabs — horizontal scroll, no wrap */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4" style={{ scrollSnapType: 'x mandatory' }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSection(t.key)} className={`shrink-0 px-4 py-2 min-h-[36px] rounded-full font-heading font-semibold text-xs transition-all ${section === t.key ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} style={{ scrollSnapAlign: 'start' }}>{t.label}</button>
        ))}
      </div>

      {/* A) Homepage */}
      {section === 'homepage' && hpLoaded && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">Edita los textos del homepage. Deja vac&iacute;o para usar el valor por defecto.</p>
          {([
            ['hero_title', 'T\u00edtulo Hero (H1)', 'Fiestas que los ni\u00f1os nunca olvidan'],
            ['hero_subtitle', 'Subt\u00edtulo Hero', 'Animaci\u00f3n, alquiler y manualidades...'],
            ['hero_cta_primary', 'Bot\u00f3n Principal', 'Ver Cat\u00e1logo'],
            ['social_proof_text', 'Social Proof', '+200 fiestas realizadas \u00b7 Panam\u00e1'],
            ['services_title', 'T\u00edtulo Servicios', 'Nuestros Servicios'],
            ['services_subtitle', 'Subt\u00edtulo Servicios', 'Todo lo que necesitas...'],
            ['featured_title', 'T\u00edtulo Destacados', 'Los M&aacute;s Populares'],
            ['featured_subtitle', 'Subt\u00edtulo Destacados', 'Los favoritos de nuestros clientes'],
            ['cta_section_title', 'T\u00edtulo CTA', 'Haz tu reserva hoy'],
            ['cta_section_subtitle', 'Subt\u00edtulo CTA', 'Arma tu paquete ideal...'],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block font-heading font-semibold text-xs text-gray-500 mb-1">{label}</label>
              <input value={hp[key]} onChange={e => setHp(prev => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} className={WI_CLS} />
            </div>
          ))}
          <button onClick={saveHomepage} disabled={savingSection === 'homepage'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'homepage' ? 'Guardando...' : 'Guardar Homepage'}</button>

          {/* Site texts merged here */}
          {siteTextsLoaded && (
            <>
              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="font-heading font-bold text-sm text-purple mb-3">Textos del carrito y checkout</p>
              </div>
              {(Object.keys(SITE_TEXT_LABELS) as (keyof SiteTexts)[]).map(key => (
                <div key={key}>
                  <label className="block font-heading font-semibold text-xs text-gray-500 mb-1">{SITE_TEXT_LABELS[key]}</label>
                  <input value={siteTexts[key] || ''} onChange={e => setSiteTexts(prev => ({ ...prev, [key]: e.target.value }))} placeholder={DEFAULT_SITE_TEXTS[key]} className={WI_CLS} />
                </div>
              ))}
              <button onClick={saveSiteTexts} disabled={savingSection === 'textos'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'textos' ? 'Guardando...' : 'Guardar Textos'}</button>
            </>
          )}

          {/* Nosotros — intro + stats */}
          {aboutLoaded && (
            <>
              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="font-heading font-bold text-sm text-purple mb-3">P\u00e1gina &ldquo;Nosotros&rdquo;</p>
              </div>
              <div>
                <label className="block font-heading font-semibold text-xs text-gray-500 mb-1">Texto de introducci\u00f3n</label>
                <textarea value={aboutIntro} onChange={e => setAboutIntro(e.target.value)} rows={3} className={`${WI_CLS} resize-none`} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {aboutStats.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <input value={s.value} onChange={e => setAboutStats(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="+600" className={WI_CLS} />
                    <input value={s.label} onChange={e => setAboutStats(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Eventos" className={WI_CLS} />
                  </div>
                ))}
              </div>
              <button onClick={saveAbout} disabled={savingSection === 'about'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'about' ? 'Guardando...' : 'Guardar Nosotros'}</button>
            </>
          )}
        </div>
      )}

      {/* E) Logo */}
      {section === 'logo' && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">Logo del sitio. Se muestra en el navbar y hero.</p>
          <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo actual" className="h-20 w-auto object-contain" />
            ) : (
              <div className="flex flex-col items-center leading-none py-2">
                <span className="font-heading font-black text-3xl text-teal tracking-tight leading-none">play</span>
                <span className="font-heading font-black text-3xl text-teal tracking-tight leading-none -mt-1">time</span>
                <span className="font-script text-sm text-purple">creando momentos.</span>
                <p className="font-body text-xs text-gray-400 mt-2">Logo tipogr&aacute;fico (por defecto)</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <label className={`flex-1 bg-purple text-white font-heading font-bold py-2.5 rounded-xl text-sm text-center cursor-pointer hover:bg-purple-light transition-colors ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {logoUploading ? 'Subiendo...' : 'Subir Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
            </label>
            {logoUrl && (
              <button onClick={resetLogo} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">Usar logo tipogr&aacute;fico</button>
            )}
          </div>

        </div>
      )}

      {/* B) Featured Products */}
      {section === 'featured' && featLoaded && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-body text-gray-500 text-sm">Selecciona hasta 6 productos para &ldquo;Los M&aacute;s Populares&rdquo;</p>
              <span className={`font-heading font-bold text-sm ${featuredIds.length >= 6 ? 'text-orange' : 'text-purple'}`}>{featuredIds.length}/6</span>
            </div>
            <div className="space-y-1 max-h-[320px] overflow-y-auto mt-2">
              {dbProducts.filter(p => p.active).map(p => {
                const checked = featuredIds.includes(p.id);
                const disabled = !checked && featuredIds.length >= 6;
                return (
                  <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-teal/10' : 'hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleFeatured(p.id)} className="w-4 h-4 accent-teal" />
                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-semibold text-sm text-gray-800 truncate block">{p.name}</span>
                      <span className="font-body text-xs text-gray-400">{p.category} {'·'} {formatCurrency(p.price)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading font-bold text-sm text-purple">&ldquo;Tambi&eacute;n piden con esto&rdquo; (carrito)</p>
                <p className="font-body text-gray-500 text-xs mt-0.5">Productos que aparecen en el carrito (hasta 6)</p>
              </div>
              <span className={`font-heading font-bold text-sm ${cartSuggestIds.length >= 6 ? 'text-orange' : 'text-purple'}`}>{cartSuggestIds.length}/6</span>
            </div>
            <div className="space-y-1 max-h-[320px] overflow-y-auto mt-2">
              {dbProducts.filter(p => p.active).map(p => {
                const checked = cartSuggestIds.includes(p.id);
                const disabled = !checked && cartSuggestIds.length >= 6;
                return (
                  <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-orange/10' : 'hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCartSuggest(p.id)} className="w-4 h-4 accent-orange" />
                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-semibold text-sm text-gray-800 truncate block">{p.name}</span>
                      <span className="font-body text-xs text-gray-400">{p.category} {'·'} {formatCurrency(p.price)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading font-bold text-sm text-purple">&ldquo;Antes de terminar&rdquo; (checkout)</p>
                <p className="font-body text-gray-500 text-xs mt-0.5">Upsells de \u00faltimo momento en el resumen del checkout (hasta 6)</p>
              </div>
              <span className={`font-heading font-bold text-sm ${checkoutSuggestIds.length >= 6 ? 'text-orange' : 'text-purple'}`}>{checkoutSuggestIds.length}/6</span>
            </div>
            <div className="space-y-1 max-h-[320px] overflow-y-auto mt-2">
              {dbProducts.filter(p => p.active).map(p => {
                const checked = checkoutSuggestIds.includes(p.id);
                const disabled = !checked && checkoutSuggestIds.length >= 6;
                return (
                  <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-teal/10' : 'hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCheckoutSuggest(p.id)} className="w-4 h-4 accent-teal" />
                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-semibold text-sm text-gray-800 truncate block">{p.name}</span>
                      <span className="font-body text-xs text-gray-400">{p.category} {'·'} {formatCurrency(p.price)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <button onClick={saveFeatured} disabled={savingSection === 'featured'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'featured' ? 'Guardando...' : 'Guardar cambios'}</button>
        </div>
      )}

      {/* FAQ Editor */}
      {section === 'faq' && faqLoaded && (
        <div className="space-y-3">
          <p className="font-body text-gray-500 text-sm">Preguntas frecuentes que aparecen en la p\u00e1gina /preguntas</p>
          {faqItems.map((item, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-heading font-bold text-xs text-gray-400">Pregunta {i + 1}</span>
                <button
                  onClick={() => setFaqItems(prev => prev.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  aria-label="Eliminar pregunta"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <input
                value={item.q}
                onChange={e => setFaqItems(prev => prev.map((p, j) => j === i ? { ...p, q: e.target.value } : p))}
                placeholder="\u00bfPregunta?"
                className={WI_CLS}
              />
              <textarea
                value={item.a}
                onChange={e => setFaqItems(prev => prev.map((p, j) => j === i ? { ...p, a: e.target.value } : p))}
                placeholder="Respuesta"
                rows={3}
                className={`${WI_CLS} resize-none`}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setFaqItems(prev => [...prev, { q: '', a: '' }])} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors">+ Agregar pregunta</button>
            <button onClick={saveFaq} disabled={savingSection === 'faq'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'faq' ? 'Guardando...' : 'Guardar FAQ'}</button>
          </div>
        </div>
      )}

      {/* C) Areas */}
      {section === 'areas' && areasLoaded && (
        <div className="space-y-6">
          {/* Contact info */}
          {contactLoaded && (
            <div className="space-y-3">
              <p className="font-heading font-bold text-sm text-purple">Datos de contacto</p>
              <p className="font-body text-gray-500 text-xs -mt-2">Se usan en footer, hero, WhatsApp y datos bancarios</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={contactInfo.whatsapp} onChange={e => setContactInfo({ ...contactInfo, whatsapp: e.target.value })} placeholder="WhatsApp (50764332724)" className={WI_CLS} />
                <input value={contactInfo.phone} onChange={e => setContactInfo({ ...contactInfo, phone: e.target.value })} placeholder="Tel\u00e9fono" className={WI_CLS} />
                <input value={contactInfo.email} onChange={e => setContactInfo({ ...contactInfo, email: e.target.value })} placeholder="Email" className={WI_CLS} />
                <input value={contactInfo.instagram} onChange={e => setContactInfo({ ...contactInfo, instagram: e.target.value })} placeholder="@instagram" className={WI_CLS} />
              </div>
              <p className="font-heading font-bold text-sm text-purple pt-2">Datos bancarios</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={contactInfo.bank_name} onChange={e => setContactInfo({ ...contactInfo, bank_name: e.target.value })} placeholder="Banco" className={WI_CLS} />
                <input value={contactInfo.bank_holder} onChange={e => setContactInfo({ ...contactInfo, bank_holder: e.target.value })} placeholder="Titular" className={WI_CLS} />
                <input value={contactInfo.bank_account_type} onChange={e => setContactInfo({ ...contactInfo, bank_account_type: e.target.value })} placeholder="Tipo de cuenta" className={WI_CLS} />
                <input value={contactInfo.bank_account_number} onChange={e => setContactInfo({ ...contactInfo, bank_account_number: e.target.value })} placeholder="N\u00famero de cuenta" className={WI_CLS} />
              </div>
              <button onClick={saveContact} disabled={savingSection === 'contact'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'contact' ? 'Guardando...' : 'Guardar contacto'}</button>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <p className="font-body text-gray-500 text-sm">&Aacute;reas de cobertura con precio de transporte</p>
          </div>
          <div className="space-y-2">
            {areas.map((area, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={area.name} onChange={e => setAreas(prev => prev.map((a, j) => j === i ? { ...a, name: e.target.value } : a))} placeholder="Nombre del \u00e1rea" className={`flex-1 ${WI_CLS}`} />
                <div className="flex items-center gap-1">
                  <span className="font-body text-sm text-gray-400">$</span>
                  <input type="number" value={area.price} onChange={e => setAreas(prev => prev.map((a, j) => j === i ? { ...a, price: Number(e.target.value) || 0 } : a))} className={`w-20 ${WI_CLS}`} min="0" />
                </div>
                <button onClick={() => { if (window.confirm(`¿Eliminar el área "${area.name || 'sin nombre'}"?`)) setAreas(prev => prev.filter((_, j) => j !== i)); }} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAreas(prev => [...prev, { name: '', price: 0 }])} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors">+ Agregar &aacute;rea</button>
            <button onClick={saveAreas} disabled={savingSection === 'areas'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'areas' ? 'Guardando...' : 'Guardar &Aacute;reas'}</button>
          </div>

          {/* Testimonials merged here */}
          {testimonialsLoaded && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="font-heading font-bold text-sm text-purple mb-3">Testimonios</p>
              <p className="font-body text-gray-500 text-xs mb-3">Testimonios que aparecen en la p{'á'}gina principal (m{'á'}x 6)</p>
              {testimonials.map((t, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2 mb-2">
                  <div className="flex items-center gap-2">
                    <input value={t.avatar} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, avatar: e.target.value } : item))} placeholder="Avatar" maxLength={4} className="w-12 border border-gray-200 rounded-lg py-1 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
                    <input value={t.name} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, name: e.target.value } : item))} placeholder="Nombre" className={`flex-1 ${WI_CLS}`} />
                    {testimonials.length > 1 && (
                      <button onClick={() => setTestimonials(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition-colors p-1">{'✕'}</button>
                    )}
                  </div>
                  <textarea value={t.text} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, text: e.target.value } : item))} placeholder="Texto del testimonio..." rows={2} className={WI_CLS} />
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => setTestimonials(prev => prev.length < 6 ? [...prev, { name: '', text: '', avatar: '' }] : prev)} disabled={testimonials.length >= 6} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors disabled:opacity-40">+ Agregar</button>
                <button onClick={saveTestimonials} disabled={savingSection === 'testimonials'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'testimonials' ? 'Guardando...' : 'Guardar Testimonios'}</button>
              </div>
            </div>
          )}
          {/* Terms & Conditions */}
          {termsLoaded && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="font-heading font-bold text-sm text-purple mb-3">T{'é'}rminos y Condiciones</p>
              <p className="font-body text-gray-500 text-xs mb-3">Secciones que aparecen en la p{'á'}gina de t{'é'}rminos y en la confirmaci{'ó'}n</p>
              {terms.map((t, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2 mb-2">
                  <div className="flex items-center gap-2">
                    <input value={t.icon} onChange={e => setTerms(prev => prev.map((item, j) => j === i ? { ...item, icon: e.target.value } : item))} placeholder="Emoji" maxLength={4} className="w-12 border border-gray-200 rounded-lg py-1 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
                    <input value={t.title} onChange={e => setTerms(prev => prev.map((item, j) => j === i ? { ...item, title: e.target.value } : item))} placeholder="T&iacute;tulo" className={`flex-1 ${WI_CLS}`} />
                    {terms.length > 1 && (
                      <button onClick={() => { if (confirm('¿Eliminar esta sección?')) setTerms(prev => prev.filter((_, j) => j !== i)); }} className="text-gray-400 hover:text-red-500 transition-colors p-1">{'✕'}</button>
                    )}
                  </div>
                  <textarea value={t.text} onChange={e => setTerms(prev => prev.map((item, j) => j === i ? { ...item, text: e.target.value } : item))} placeholder="Texto de la sección (usa Enter para saltos de línea)..." rows={3} className={WI_CLS} />
                  <div className="flex gap-1">
                    {i > 0 && (
                      <button onClick={() => setTerms(prev => { const n = [...prev]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} className="text-gray-400 hover:text-purple transition-colors p-1 text-xs font-heading">{'▲'}</button>
                    )}
                    {i < terms.length - 1 && (
                      <button onClick={() => setTerms(prev => { const n = [...prev]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; })} className="text-gray-400 hover:text-purple transition-colors p-1 text-xs font-heading">{'▼'}</button>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => setTerms(prev => [...prev, { icon: '', title: '', text: '' }])} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors">+ Agregar secci{'ó'}n</button>
                <button onClick={saveTerms} disabled={savingSection === 'terms'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'terms' ? 'Guardando...' : 'Guardar T\u00e9rminos'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Standalone reels/testimonials/textos sections removed — merged into Logo & Config */}
    </div>
  );
}

// ─── CATÁLOGO ADMIN TAB (merges Products + Categories) ───

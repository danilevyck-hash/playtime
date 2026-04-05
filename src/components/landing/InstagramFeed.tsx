'use client';

import { useState, useEffect } from 'react';
import { fetchSetting } from '@/lib/supabase-data';

interface ReelData {
  url: string;
  id: string;
}

export default function InstagramFeed() {
  const [reels, setReels] = useState<ReelData[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchSetting<ReelData[]>('reels');
        if (!cancelled && data && data.length > 0) {
          setReels(data);
          return;
        }
      } catch (e) {
        console.error('Error loading reels:', e);
      }

      // Fallback to localStorage
      if (!cancelled) {
        try {
          const saved = localStorage.getItem('playtime_reels');
          if (saved) {
            setReels(JSON.parse(saved));
          }
        } catch (e) {
          console.error('Error loading cached reels:', e);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="bg-cream py-10 md:py-14">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-3">
            Sigue a PlayTime
          </h2>
          <p className="font-body font-normal text-gray-600 max-w-md mx-auto">
            Mira nuestros eventos, fotos y novedades
          </p>
        </div>

        {/* Reels as clickable thumbnails — no iframes */}
        {reels.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-10 max-w-2xl mx-auto">
            {reels.slice(0, 3).map((reel) => (
              <a
                key={reel.id}
                href={reel.url || `https://www.instagram.com/reel/${reel.id}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-gradient-to-br from-purple/10 to-teal/10 group shadow-sm border border-gray-100 hover:shadow-lg transition-shadow"
              >
                {/* Instagram thumbnail via embed API */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://www.instagram.com/reel/${reel.id}/media/?size=l`}
                  alt="Instagram Reel de PlayTime"
                  className="w-full h-full object-cover"
                  onError={(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none'; el.parentElement?.classList.add('bg-gradient-to-br', 'from-purple/20', 'to-teal/20'); }}
                />
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                  <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-purple ml-1" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                {/* Instagram badge */}
                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-full px-2.5 py-1 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#E1306C">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  <span className="text-[10px] font-heading font-bold text-gray-700">Reel</span>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Instagram CTA */}
        <div className="max-w-lg mx-auto">
          <a
            href="https://instagram.com/playtimekids"
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-white rounded-3xl p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 group text-center"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </div>
            <h3 className="font-heading font-bold text-xl text-purple mb-1">@playtimekids</h3>
            <p className="font-body font-normal text-gray-500 text-sm mb-4">Fiestas, ideas y momentos m&aacute;gicos</p>
            <span className="inline-flex items-center gap-2 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] text-white font-heading font-bold px-5 py-2.5 rounded-full text-sm group-hover:shadow-lg transition-shadow">
              Seguir en Instagram
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

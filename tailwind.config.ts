import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'media',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        purple: { DEFAULT: '#580459', light: '#7A2680' },
        teal: { DEFAULT: '#84D9D0', light: '#A8E6DF' },
        orange: { DEFAULT: '#F27405', light: '#F59542' },
        pink: { DEFAULT: '#F27289', light: '#F5A0B0' },
        // Accessible (WCAG AA) variants for use as TEXT on light backgrounds.
        // The pastels above stay for FILLS; these carry enough contrast for copy.
        'teal-text': '#0F766E',
        'orange-text': '#B33E00',
        'orange-solid': '#C2410C',
        'pink-text': '#BE185D',
        teal2: { DEFAULT: '#49B3BF', light: '#7CCAD3' },
        yellow: { DEFAULT: '#F2C84B', light: '#F5D97A' },
        cream: '#FAF3E8',
        beige: '#FAF3E8',
        mint: { DEFAULT: '#84D9D0', light: '#A8E6DF' },
      },
      fontFamily: {
        heading: ['var(--font-chalet)', 'sans-serif'],
        script: ['var(--font-chalet)', 'sans-serif'],
        body: ['var(--font-chalet)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;

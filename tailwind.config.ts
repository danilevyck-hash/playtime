import type { Config } from "tailwindcss";

const config: Config = {
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
        teal2: { DEFAULT: '#49B3BF', light: '#7CCAD3' },
        yellow: { DEFAULT: '#F2C84B', light: '#F5D97A' },
        cream: '#FAF3E8',
        beige: '#FAF3E8',
        mint: { DEFAULT: '#84D9D0', light: '#A8E6DF' },
      },
      fontFamily: {
        heading: ['var(--font-nunito)', 'sans-serif'],
        script: ['var(--font-pacifico)', 'cursive'],
        body: ['var(--font-nunito)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;

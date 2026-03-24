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
        mint: { DEFAULT: '#84D9D0', light: '#A8E6DF' },
        orange: { DEFAULT: '#F27405', light: '#F59542' },
        pink: { DEFAULT: '#F27289', light: '#F5A0B0' },
        teal: { DEFAULT: '#49B3BF', light: '#7CCAD3' },
        yellow: { DEFAULT: '#F2C84B', light: '#F5D97A' },
        cream: '#FDF8F0',
        beige: '#F5EDE3',
      },
      fontFamily: {
        heading: ['var(--font-quicksand)', 'sans-serif'],
        script: ['var(--font-pacifico)', 'cursive'],
        body: ['var(--font-nunito)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;

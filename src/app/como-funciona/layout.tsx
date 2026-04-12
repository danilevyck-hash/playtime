import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cómo Funciona',
  description: 'Descubre lo fácil que es organizar tu fiesta con PlayTime. En 3 simples pasos, tu evento está listo.',
};

export default function ComoFuncionaLayout({ children }: { children: React.ReactNode }) {
  return children;
}

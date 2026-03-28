'use client';

import { createContext, useContext, ReactNode } from 'react';

const LogoContext = createContext<string | null>(null);

export function LogoProvider({ initialLogoUrl, children }: { initialLogoUrl: string | null; children: ReactNode }) {
  return <LogoContext.Provider value={initialLogoUrl}>{children}</LogoContext.Provider>;
}

export function useLogoUrl(): string | null {
  return useContext(LogoContext);
}

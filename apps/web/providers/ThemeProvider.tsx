/**
 * ThemeProvider — thin wrapper around next-themes.
 *
 * Kept as a separate file so it can be swapped out without touching
 * AppProviders. The 'attribute="class"' prop pairs with the .dark class
 * used by shadcn/ui and Tailwind's darkMode: 'class' config.
 */
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

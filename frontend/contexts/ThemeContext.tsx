'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';

/**
 * Ported from the plumo PM console (src/contexts/ThemeContext.tsx) so both
 * pillars share one theme contract: localStorage key `theme`, a
 * prefers-color-scheme bootstrap, a class swap on <html>, and a `density`
 * control persisting to localStorage['plumo_density'].
 *
 * One deliberate difference: PM cycles light -> dark -> terminal. CS ships
 * light + dark only. Terminal overrides just the six base surface/border
 * tokens, and CS's screens still run on the older `--cs-*` namespace, so a
 * straight port would repaint the primitives near-black while the shell stayed
 * green. It becomes a ~8-line addition once item 46 retires `--cs-*`.
 * (Design-parity plan, Open Question C.)
 */

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable' | 'relaxed';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (next: Theme) => void;
  density: Density;
  setDensity: (next: Density) => void;
}

/** Exported so the class-component console can read it via `contextType`. */
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DENSITY_KEY = 'plumo_density';
const THEMES: Theme[] = ['light', 'dark'];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [density, setDensityState] = useState<Density>('comfortable');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const storedTheme = localStorage.getItem('theme') as Theme | null;
    if (storedTheme && THEMES.includes(storedTheme)) {
      setThemeState(storedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setThemeState(prefersDark ? 'dark' : 'light');
    }

    const storedDensity = localStorage.getItem(DENSITY_KEY) as Density | null;
    if (
      storedDensity === 'compact' ||
      storedDensity === 'relaxed' ||
      storedDensity === 'comfortable'
    ) {
      setDensityState(storedDensity);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark', 'terminal');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme, mounted]);

  // Density — writes data-density attribute on <html>, per DENSITY.md §toggle UX.
  // "comfortable" is the default; remove attribute so :root fallback applies.
  useEffect(() => {
    if (!mounted) return;
    const root = window.document.documentElement;
    if (density === 'comfortable') {
      root.removeAttribute('data-density');
    } else {
      root.dataset.density = density;
    }
    localStorage.setItem(DENSITY_KEY, density);
  }, [density, mounted]);

  // Header quick-toggle cycles Light -> Dark -> Light.
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const setDensity = useCallback((next: Density) => setDensityState(next), []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, density, setDensity }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

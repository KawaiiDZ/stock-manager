import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorTheme = 'emerald' | 'indigo' | 'sky' | 'rose' | 'slate';

export interface ColorThemeOption {
  id: ColorTheme;
  name: string;
  primaryColor: string;
  previewClass: string;
  description: string;
}

export const COLOR_THEME_OPTIONS: ColorThemeOption[] = [
  {
    id: 'emerald',
    name: 'Emerald Green',
    primaryColor: '#059669',
    previewClass: 'bg-emerald-600',
    description: 'Classic crisp POS aesthetic, optimal for high readability',
  },
  {
    id: 'indigo',
    name: 'Royal Indigo',
    primaryColor: '#4f46e5',
    previewClass: 'bg-indigo-600',
    description: 'Modern corporate look with deep indigo accents',
  },
  {
    id: 'sky',
    name: 'Ocean Sky',
    primaryColor: '#0284c7',
    previewClass: 'bg-sky-600',
    description: 'Vibrant and energetic cyan blue tones',
  },
  {
    id: 'rose',
    name: 'Warm Rose',
    primaryColor: '#e11d48',
    previewClass: 'bg-rose-600',
    description: 'Distinctive warm crimson palette for boutique shops',
  },
  {
    id: 'slate',
    name: 'Monochrome Slate',
    primaryColor: '#475569',
    previewClass: 'bg-slate-600',
    description: 'Neutral, minimalist aesthetic focused purely on content',
  },
];

interface ThemeContextType {
  themeMode: ThemeMode;
  colorTheme: ColorTheme;
  effectiveMode: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => void;
  setColorTheme: (theme: ColorTheme) => void;
  toggleDarkMode: () => void;
  syncFromSettings: (mode?: string, color?: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('sm_theme_mode');
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    return 'light';
  });

  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem('sm_color_theme');
    if (saved === 'emerald' || saved === 'indigo' || saved === 'sky' || saved === 'rose' || saved === 'slate') {
      return saved;
    }
    return 'emerald';
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen to OS system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  const effectiveMode: 'light' | 'dark' =
    themeMode === 'system' ? (systemIsDark ? 'dark' : 'light') : themeMode;

  // Apply dark mode class and color theme data attribute to documentElement
  useEffect(() => {
    const root = document.documentElement;

    if (effectiveMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Set data-theme attribute and clean old theme classes
    root.setAttribute('data-theme', colorTheme);
    const themeClasses = ['theme-emerald', 'theme-indigo', 'theme-sky', 'theme-rose', 'theme-slate'];
    themeClasses.forEach((cls) => root.classList.remove(cls));
    root.classList.add(`theme-${colorTheme}`);

    localStorage.setItem('sm_theme_mode', themeMode);
    localStorage.setItem('sm_color_theme', colorTheme);
  }, [themeMode, colorTheme, effectiveMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('sm_theme_mode', mode);
  }, []);

  const setColorTheme = useCallback((color: ColorTheme) => {
    setColorThemeState(color);
    localStorage.setItem('sm_color_theme', color);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setThemeModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('sm_theme_mode', next);
      return next;
    });
  }, []);

  const syncFromSettings = useCallback((mode?: string, color?: string) => {
    if (mode && (mode === 'light' || mode === 'dark' || mode === 'system')) {
      setThemeModeState(mode);
      localStorage.setItem('sm_theme_mode', mode);
    }
    if (color && (color === 'emerald' || color === 'indigo' || color === 'sky' || color === 'rose' || color === 'slate')) {
      setColorThemeState(color);
      localStorage.setItem('sm_color_theme', color);
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        colorTheme,
        effectiveMode,
        setThemeMode,
        setColorTheme,
        toggleDarkMode,
        syncFromSettings,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};

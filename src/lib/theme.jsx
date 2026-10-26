import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Single source of truth for colors. CSS reads them as custom properties
// (written onto <html>), charts and the map read the same values from JS.
// Data colors come from the validated dataviz reference palette.

const SHARED = {
  status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
};

export const THEMES = {
  light: {
    ...SHARED,
    mode: 'light',
    page: '#f4f3ef',
    surface: '#fcfcfb',
    surface2: '#f0efea',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
    accent: '#0b0b0b',
    // Rain intensity, ordinal: dry -> widespread storms (validated --ordinal, light).
    rain: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'],
    haze: '#a8a69e',
    series1: '#2a78d6',
    temp: '#eb6834', // categorical slot 2, used for the temperature series
    tempLow: '#2a78d6',
    // Earthquake depth, ordinal: shallow -> deep.
    depth: ['#86b6ef', '#2a78d6', '#0d366b'],
    land: '#e9e8e2',
    tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  },
  dark: {
    ...SHARED,
    mode: 'dark',
    page: '#0b0c0e',
    surface: '#1a1a19',
    surface2: '#232322',
    ink: '#f0efec',
    ink2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    border: 'rgba(255,255,255,0.10)',
    accent: '#f0efec',
    // Anchor flips on dark: stronger storms are lighter (validated --ordinal, dark).
    rain: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'],
    haze: '#6b6a65',
    series1: '#3987e5',
    temp: '#d95926',
    tempLow: '#3987e5',
    depth: ['#b7d3f6', '#3987e5', '#184f95'],
    land: '#262624',
    tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  },
};

const STORAGE_KEY = 'wf-theme';

function initialMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(initialMode);
  const theme = THEMES[mode];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    const vars = {
      page: theme.page,
      surface: theme.surface,
      surface2: theme.surface2,
      ink: theme.ink,
      ink2: theme.ink2,
      muted: theme.muted,
      grid: theme.grid,
      axis: theme.axis,
      border: theme.border,
      accent: theme.accent,
      series1: theme.series1,
      temp: theme.temp,
      good: theme.status.good,
      warning: theme.status.warning,
      serious: theme.status.serious,
      critical: theme.status.critical,
    };
    theme.rain.forEach((c, i) => (vars[`rain${i}`] = c));
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--${k}`, v);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode, theme]);

  const value = useMemo(() => ({ theme, mode, toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }), [theme, mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function rainColor(theme, parsed) {
  return parsed.level < 0 ? theme.haze : theme.rain[parsed.level];
}

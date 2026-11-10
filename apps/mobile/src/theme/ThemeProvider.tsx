import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import { colors as lightColors, darkColors, type ColorPalette } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeScheme = 'light' | 'dark';

const THEME_MODE_KEY = 'marketplat.theme-mode.v1';

export type AppTheme = {
  mode: ThemeMode;
  scheme: ThemeScheme;
  isDark: boolean;
  colors: ColorPalette;
  setMode: (mode: ThemeMode) => Promise<boolean>;
};

const ThemeContext = createContext<AppTheme | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const selectionMade = useRef(false);

  useEffect(() => {
    let active = true;
    if (Platform.OS === 'web') return () => { active = false; };

    void SecureStore.getItemAsync(THEME_MODE_KEY)
      .then((saved) => {
        if (active && !selectionMade.current && isThemeMode(saved)) setModeState(saved);
      })
      .catch(() => {
        // A theme preference is optional. Keep following the system if storage is unavailable.
      });

    return () => { active = false; };
  }, []);

  const setMode = useCallback(async (nextMode: ThemeMode): Promise<boolean> => {
    selectionMade.current = true;
    setModeState(nextMode);
    if (Platform.OS === 'web') return true;
    try {
      await SecureStore.setItemAsync(THEME_MODE_KEY, nextMode);
      return true;
    } catch {
      // Keep the choice for this run, but report that it could not be persisted.
      return false;
    }
  }, []);

  const scheme: ThemeScheme = mode === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : mode;
  const palette = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo<AppTheme>(() => ({
    mode,
    scheme,
    isDark: scheme === 'dark',
    colors: palette,
    setMode,
  }), [mode, palette, scheme, setMode]);

  // The initial render uses the system palette; a saved override is applied as soon as SecureStore resolves.

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return value;
}

/**
 * Safe palette access for framework error boundaries, which Expo Router may
 * render outside the normal provider tree after a root-layout failure.
 */
export function useAppThemeColors(): ColorPalette {
  const value = useContext(ThemeContext);
  const systemScheme = useColorScheme();
  const [persistedMode, setPersistedMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    if (value || Platform.OS === 'web') return undefined;
    let active = true;
    void SecureStore.getItemAsync(THEME_MODE_KEY)
      .then((saved) => {
        if (active && isThemeMode(saved)) setPersistedMode(saved);
      })
      .catch(() => {
        // A boundary must stay renderable even when secure storage is unavailable.
      });
    return () => { active = false; };
  }, [value]);

  if (value) return value.colors;
  const fallbackScheme = persistedMode && persistedMode !== 'system'
    ? persistedMode
    : systemScheme;
  return fallbackScheme === 'dark' ? darkColors : lightColors;
}

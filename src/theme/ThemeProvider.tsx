import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { AppState, Appearance, StyleSheet } from "react-native";
import { reloadAppAsync } from "expo";
import { launchScheme, systemScheme } from "./theme";
import { darkPalette, lightPalette, radius, space, typeScale, type Palette } from "./tokens";

export type SchemeName = "light" | "dark";

export interface Theme {
  scheme: SchemeName;
  colors: Palette;
  type: typeof typeScale;
  space: typeof space;
  radius: typeof radius;
}

// Follows the system appearance as of launch, matching the static legacy
// `colors` (theme.ts) so every screen agrees. Those colors are baked into
// StyleSheets at load time, so when the system appearance changes (manually,
// or on iOS's sunset schedule) the app reloads to pick the new scheme up.
// The check is debounced and only runs in the foreground: iOS briefly flips
// the scheme while an app is being backgrounded for its snapshot.
const RELOAD_DEBOUNCE_MS = 1000;

function useReloadOnAppearanceChange() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (AppState.currentState === "active" && systemScheme() !== launchScheme) {
          reloadAppAsync("system appearance changed").catch(() => undefined);
        }
      }, RELOAD_DEBOUNCE_MS);
    };
    const appearance = Appearance.addChangeListener(check);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      if (timer) clearTimeout(timer);
      appearance.remove();
      appState.remove();
    };
  }, []);
}

function buildTheme(scheme: SchemeName): Theme {
  return { scheme, colors: scheme === "dark" ? darkPalette : lightPalette, type: typeScale, space, radius };
}

const DARK_THEME = buildTheme("dark");
const LIGHT_THEME = buildTheme("light");
const ThemeContext = createContext<Theme>(DARK_THEME);

export function ThemeProvider({ children }: { children: ReactNode }) {
  useReloadOnAppearanceChange();
  const theme = launchScheme === "dark" ? DARK_THEME : LIGHT_THEME;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// Theme-aware StyleSheet: define styles once at module scope as a function
// of the theme, call the returned hook inside the component.
//   const useStyles = makeStyles((t) => ({ title: { color: t.colors.textPrimary } }));
//   const styles = useStyles();
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<SchemeName, T>();
  return function useStyles() {
    const theme = useTheme();
    return useMemo(() => {
      const hit = cache.get(theme.scheme);
      if (hit) return hit;
      const created = StyleSheet.create(factory(theme));
      cache.set(theme.scheme, created);
      return created;
    }, [theme]);
  };
}
